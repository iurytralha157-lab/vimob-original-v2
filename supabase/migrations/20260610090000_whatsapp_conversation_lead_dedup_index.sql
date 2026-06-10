-- =======================================================================
-- PASSO 1: Limpar conversas duplicadas por lead_id + organization_id
-- Estratégia: para mensagens da conversa perdedora, tenta UPDATE do
-- conversation_id para a vencedora. Se houver conflito de message_id
-- na vencedora (mensagem duplicada), simplesmente deleta da perdedora.
-- PASSO 2: Cria índice único para prevenir duplicatas futuras.
-- =======================================================================

DO $$
DECLARE
  rec RECORD;
  v_winner_id UUID;
  v_loser_id UUID;
  v_total_merges INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      organization_id,
      lead_id,
      array_agg(id ORDER BY last_message_at DESC NULLS LAST, created_at DESC) AS ids
    FROM public.whatsapp_conversations
    WHERE lead_id IS NOT NULL
      AND deleted_at IS NULL
      AND is_group IS NOT TRUE
    GROUP BY organization_id, lead_id
    HAVING COUNT(*) > 1
  LOOP
    v_winner_id := rec.ids[1];

    FOR i IN 2..array_length(rec.ids, 1) LOOP
      v_loser_id := rec.ids[i];

      RAISE NOTICE 'Merging % → % (lead %)', v_loser_id, v_winner_id, rec.lead_id;

      -- UPDATE das mensagens que NÃO têm conflito em (conversation_id, message_id)
      -- nem em (session_id, message_id) na conversa vencedora
      UPDATE public.whatsapp_messages src
      SET conversation_id = v_winner_id
      WHERE src.conversation_id = v_loser_id
        AND NOT EXISTS (
          SELECT 1 FROM public.whatsapp_messages ex
          WHERE ex.conversation_id = v_winner_id
            AND ex.message_id = src.message_id
            AND ex.message_id IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.whatsapp_messages ex
          WHERE ex.session_id = src.session_id
            AND ex.message_id = src.message_id
            AND ex.conversation_id = v_winner_id
            AND ex.message_id IS NOT NULL
        );

      -- Deletar mensagens que não conseguimos mover (eram verdadeiras duplicatas)
      DELETE FROM public.whatsapp_messages
      WHERE conversation_id = v_loser_id;

      -- Atualizar metadados da vencedora
      UPDATE public.whatsapp_conversations w
      SET
        last_message = CASE
          WHEN w.last_message_at IS NULL OR w.last_message_at < (
            SELECT last_message_at FROM public.whatsapp_conversations WHERE id = v_loser_id
          )
          THEN (SELECT last_message FROM public.whatsapp_conversations WHERE id = v_loser_id)
          ELSE w.last_message
        END,
        last_message_at = GREATEST(
          w.last_message_at,
          (SELECT last_message_at FROM public.whatsapp_conversations WHERE id = v_loser_id)
        ),
        contact_picture = COALESCE(
          w.contact_picture,
          (SELECT contact_picture FROM public.whatsapp_conversations WHERE id = v_loser_id)
        ),
        updated_at = now()
      WHERE id = v_winner_id;

      -- Soft delete da conversa perdedora
      UPDATE public.whatsapp_conversations
      SET deleted_at = now(), updated_at = now()
      WHERE id = v_loser_id;

      v_total_merges := v_total_merges + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Merge concluído. Total de conversas duplicadas removidas: %', v_total_merges;
END;
$$;

-- =======================================================================
-- PASSO 2: Criar índice único APÓS a limpeza
-- =======================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_org_lead_active
  ON public.whatsapp_conversations (organization_id, lead_id)
  WHERE lead_id IS NOT NULL
    AND deleted_at IS NULL
    AND is_group IS NOT TRUE;

COMMENT ON INDEX uq_whatsapp_conversations_org_lead_active IS
  'Garante que cada lead ativo tenha no máximo uma conversa de WhatsApp por organização, '
  'independente de quantas sessions estejam conectadas.';
