# Checkpoint Técnico: Integração Evolution Go (whatsmeow)

## 1. Regras de Status (A verdade absoluta)
- **LoggedIn: true** -> Confirmação real de que o WhatsApp está pareado e online. Única condição para status `connected`.
- **Connected: true** -> Significa apenas que a instância (servidor) está ativa. Se `LoggedIn` for `false`, o status deve ser `qr_ready`.
- **QR Found** -> Nunca deve marcar como `connected`. Status permanece `qr_ready`.

## 2. Fluxo de Estados
- **Criação/QR**: Instância nasce -> QR gerado -> Status: `qr_ready`.
- **Pareamento**: QR escaneado -> Webhook/Status recebe `LoggedIn: true` -> Status: `connected`.
- **Desconexão**: Logout via celular ou API -> `LoggedIn: false` ou `state: close` -> Status: `disconnected`.

## 3. Arquitetura de Arquivos
- `supabase/functions/evolution-go-proxy/index.ts`: Proxy seguro que normaliza as respostas da API para o padrão VIMob. Contém a lógica de `smartFetch` (fallback para instâncias antigas).
- `supabase/functions/evolution-go-webhook/index.ts`: Recebe eventos em tempo real. Implementa bloqueio de segurança `BLOCKED_STATUS_UPDATE_NO_UNIQUE_SESSION`.
- `src/hooks/use-whatsapp-sessions.ts`: Hooks de mutação e consulta que utilizam o proxy.
- `src/components/settings/WhatsAppTab.tsx`: UI simplificada que reflete o banco de dados via Realtime e Polling de segurança.

## 4. Diretrizes de Segurança e Estabilidade
- **Filtro Único**: Todo `UPDATE` na tabela `whatsapp_sessions` deve usar `id` (UUID) ou `session_id`. Nunca atualizar por filtros genéricos.
- **Concorrência**: O webhook tem prioridade. O polling na UI serve apenas para garantir a atualização caso o webhook falhe ou demore.
- **Normalização**: Centralizada nas Edge Functions para evitar que a UI precise conhecer detalhes das diferentes APIs.

## 5. Status do Sistema
- Build: **Passando**
- Integração: **Ativa e Estável**
- Logs: **Detalhados (Connected vs LoggedIn) nas Edge Functions**
