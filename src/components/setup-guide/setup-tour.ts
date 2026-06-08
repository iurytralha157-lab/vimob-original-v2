import type { SetupStepId } from '@/hooks/use-setup-guide';

interface TourOptions {
  target: string;
  stepId: SetupStepId;
  onComplete: () => void;
}

interface TourPoint {
  target: string;
  title: string;
  body: string;
}

const TOUR_SEQUENCES: Partial<Record<SetupStepId, TourPoint[]>> = {
  whatsapp: [
    {
      target: 'whatsapp-new-session',
      title: 'Conecte seu WhatsApp',
      body: 'Clique em Nova, informe um nome para a conexão e escaneie o QR Code no WhatsApp do celular. Depois aguarde o status ficar como Conectado.',
    },
  ],
  profile: [
    {
      target: 'account-profile',
      title: 'Meu perfil',
      body: 'Aqui ficam seus dados pessoais. Clique em Editar para atualizar nome, CPF, telefone e WhatsApp. O WhatsApp precisa estar preenchido.',
    },
    {
      target: 'account-avatar',
      title: 'Foto do usuário',
      body: 'Use a câmera no avatar para colocar sua foto. Essa imagem aparece nos cards, equipes e responsáveis.',
    },
    {
      target: 'account-password',
      title: 'Senha',
      body: 'Nesta área você atualiza a senha quando precisar. O sistema protege alterações muito próximas para evitar troca acidental.',
    },
  ],
  contacts: [
    {
      target: 'contacts-import',
      title: 'Importar e exportar',
      body: 'Use este botão para importar contatos por CSV ou Excel e exportar a lista filtrada.',
    },
    {
      target: 'contacts-lost',
      title: 'Leads perdidos',
      body: 'Aqui você alterna para a visão de leads perdidos e enxerga o motivo informado na perda.',
    },
    {
      target: 'contacts-new',
      title: 'Novo lead',
      body: 'Crie um lead manualmente quando ele chegar por outro canal ou precisar ser cadastrado direto na base.',
    },
    {
      target: 'contacts-filters',
      title: 'Filtros',
      body: 'Filtre por busca, período, equipe, responsável, origem, campanha, tags e status. Os filtros combinam entre si.',
    },
    {
      target: 'contacts-list',
      title: 'Lista de contatos',
      body: 'Aqui aparecem os contatos encontrados. Clique em uma linha ou card para abrir o detalhe completo do lead.',
    },
  ],
  conversations: [
    {
      target: 'conversations-channel',
      title: 'Conta WhatsApp',
      body: 'Selecione a conexão do WhatsApp quando houver mais de uma. Cada conexão respeita seus acessos.',
    },
    {
      target: 'conversations-search',
      title: 'Buscar conversas',
      body: 'Use a busca para encontrar conversas por nome, telefone ou conteúdo disponível.',
    },
    {
      target: 'conversations-hide-groups',
      title: 'Ocultar grupos',
      body: 'Ative para esconder grupos do WhatsApp e deixar a lista focada em atendimentos individuais.',
    },
    {
      target: 'conversations-archived',
      title: 'Arquivadas',
      body: 'Ative para visualizar conversas arquivadas. Isso ajuda a recuperar atendimentos encerrados.',
    },
    {
      target: 'conversations-list',
      title: 'Lista de conversas',
      body: 'As conversas aparecem aqui. Abra uma conversa para responder, anexar arquivos e ver o lead vinculado.',
    },
  ],
  first_lead: [
    {
      target: 'pipeline-new-lead',
      title: 'Criar novo lead',
      body: 'Preencha nome e telefone ou e-mail. Depois avance pelas abas Perfil e Gestão e clique em Criar Lead.',
    },
  ],
  pipeline: [
    {
      target: 'pipeline-selector',
      title: 'Selecionar pipeline',
      body: 'Aqui você troca entre pipelines, como vendas, locação ou outros fluxos configurados.',
    },
    {
      target: 'pipeline-filters',
      title: 'Filtros da pipeline',
      body: 'Use período, equipe, responsável, origem, campanha, tags, status e busca para focar nos leads certos.',
    },
    {
      target: 'pipeline-refresh',
      title: 'Atualizar',
      body: 'Este botão força a atualização dos cards quando quiser conferir se entrou algo novo.',
    },
    {
      target: 'pipeline-column',
      title: 'Colunas',
      body: 'Cada coluna representa uma etapa do atendimento. O número mostra quantos leads estão naquela etapa.',
    },
    {
      target: 'pipeline-column-settings',
      title: 'Configuração da coluna',
      body: 'Use este menu para ajustar automações, cadências e configurações relacionadas à etapa.',
    },
    {
      target: 'pipeline-card',
      title: 'Card do lead',
      body: 'O card resume nome, telefone, origem, responsável, imóvel e status. Clique nele para abrir o detalhe completo.',
    },
  ],
  dashboard: [
    {
      target: 'dashboard-filters',
      title: 'Filtros da dashboard',
      body: 'Os filtros definem o período e o recorte dos dados. Eles afetam KPIs, funil, origem e evolução.',
    },
    {
      target: 'dashboard-kpi-leads',
      title: 'Leads',
      body: 'Mostra quantos leads entraram no período selecionado.',
    },
    {
      target: 'dashboard-kpi-open',
      title: 'Em aberto',
      body: 'Mostra quantos leads daquele período ainda estão em atendimento e qual percentual representam.',
    },
    {
      target: 'dashboard-kpi-lost',
      title: 'Perdidos',
      body: 'Mostra quantos leads do período foram perdidos. A porcentagem fica vermelha porque é um indicador de perda.',
    },
    {
      target: 'dashboard-kpi-won',
      title: 'Ganhos',
      body: 'Mostra vendas fechadas no período, mesmo que o lead tenha entrado antes. Clique no card para abrir o relatório de tempo até o ganho.',
    },
    {
      target: 'dashboard-kpi-visits',
      title: 'Visitas',
      body: 'Mostra visitas agendadas no período e a proporção em relação aos leads.',
    },
    {
      target: 'dashboard-kpi-vgv',
      title: 'VGV',
      body: 'Mostra o valor geral de vendas dos ganhos fechados no período.',
    },
    {
      target: 'dashboard-kpi-first-contact',
      title: 'Primeiro contato',
      body: 'Mostra o tempo médio até a primeira ligação ou mensagem registrada.',
    },
    {
      target: 'dashboard-kpi-properties',
      title: 'Imóveis',
      body: 'Mostra quantos imóveis estão cadastrados no sistema dentro do acesso atual.',
    },
    {
      target: 'dashboard-kpi-site-visits',
      title: 'Visitas no site',
      body: 'Mostra as visitas do site no período selecionado.',
    },
    {
      target: 'dashboard-evolution',
      title: 'Evolução de negócios',
      body: 'Este gráfico mostra como os negócios evoluíram no tempo dentro dos filtros ativos.',
    },
    {
      target: 'dashboard-funnel',
      title: 'Funil',
      body: 'Aqui você entende em quais etapas os leads estão concentrados.',
    },
    {
      target: 'dashboard-sources',
      title: 'Origem',
      body: 'Este bloco mostra de quais canais os leads vieram, respeitando filtros de período, campanha e demais recortes.',
    },
  ],
};

const FALLBACK_MESSAGES: Record<string, TourPoint> = {
  'team-add-user': {
    target: 'team-add-user',
    title: 'Adicione um corretor',
    body: 'Clique aqui para convidar um novo membro à sua equipe. Ele receberá login e senha pelo WhatsApp.',
  },
  'distribution-new-queue': {
    target: 'distribution-new-queue',
    title: 'Crie uma fila',
    body: 'Clique aqui para configurar como os leads serão distribuídos automaticamente.',
  },
  'automations-new': {
    target: 'automations-new',
    title: 'Crie uma automação',
    body: 'Clique aqui para começar uma nova automação de mensagens.',
  },
};

export function startSetupTour({ target, stepId, onComplete }: TourOptions) {
  const sequence = TOUR_SEQUENCES[stepId] || [FALLBACK_MESSAGES[target] || {
    target,
    title: 'Próximo passo',
    body: 'Veja este ponto da tela para continuar.',
  }];

  startTourSequence(sequence, 0, onComplete);
}

function startTourSequence(sequence: TourPoint[], index: number, onComplete: () => void) {
  const point = sequence[index];
  if (!point) {
    onComplete();
    return;
  }

  waitForVisibleTarget(
    point.target,
    (el) => {
      showTour({
        el,
        point,
        index,
        total: sequence.length,
        onNext: () => startTourSequence(sequence, index + 1, onComplete),
        onComplete,
      });
    },
    () => startTourSequence(sequence, index + 1, onComplete),
  );
}

function waitForVisibleTarget(target: string, callback: (el: HTMLElement) => void, onMissing: () => void) {
  let attempts = 0;
  const maxAttempts = 30;

  const tryStart = () => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
    const el = elements.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    });

    if (!el) {
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(tryStart, 200);
      } else {
        onMissing();
      }
      return;
    }

    callback(el);
  };

  tryStart();
}

function showTour({
  el,
  point,
  index,
  total,
  onNext,
  onComplete,
}: {
  el: HTMLElement;
  point: TourPoint;
  index: number;
  total: number;
  onNext: () => void;
  onComplete: () => void;
}) {
  document.querySelectorAll('.setup-tour-layer').forEach((n) => n.remove());

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

  setTimeout(() => {
    const rect = el.getBoundingClientRect();
    const padding = 8;
    const tooltipWidth = Math.min(360, window.innerWidth - 32);
    const tooltipHeight = 190;

    const layer = document.createElement('div');
    layer.className = 'setup-tour-layer';
    layer.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9998;
      pointer-events: none;
    `;

    const blocker = document.createElement('div');
    blocker.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: auto;
      background: transparent;
    `;
    layer.appendChild(blocker);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: ${Math.max(8, rect.top - padding)}px;
      left: ${Math.max(8, rect.left - padding)}px;
      width: ${Math.min(window.innerWidth - 16, rect.width + padding * 2)}px;
      height: ${Math.min(window.innerHeight - 16, rect.height + padding * 2)}px;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px hsl(0 0% 0% / 0.55);
      border: 2px solid hsl(var(--primary));
      pointer-events: none;
      animation: setupTourPulse 1.6s ease-in-out infinite;
    `;
    layer.appendChild(overlay);

    const preferredTop = rect.bottom + 16;
    const fallbackTop = rect.top - tooltipHeight - 16;
    const tooltipTop = clamp(
      preferredTop + tooltipHeight > window.innerHeight ? fallbackTop : preferredTop,
      16,
      window.innerHeight - tooltipHeight - 16,
    );
    const tooltipLeft = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, 16, window.innerWidth - tooltipWidth - 16);

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: absolute;
      top: ${tooltipTop}px;
      left: ${tooltipLeft}px;
      width: ${tooltipWidth}px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      border: 1px solid hsl(var(--border));
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 40px hsl(0 0% 0% / 0.25);
      pointer-events: auto;
      font-family: inherit;
    `;

    const isLast = index >= total - 1;
    tooltip.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:hsl(var(--muted-foreground));margin-bottom:4px;">${index + 1} de ${total}</div>
          <h4 style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(point.title)}</h4>
        </div>
        <button data-tour-close style="background:none;border:none;color:hsl(var(--muted-foreground));cursor:pointer;padding:0;line-height:1;">×</button>
      </div>
      <p style="font-size:13px;color:hsl(var(--muted-foreground));margin:0 0 12px 0;line-height:1.5;">${escapeHtml(point.body)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button data-tour-skip style="background:none;border:1px solid hsl(var(--border));color:hsl(var(--foreground));padding:7px 12px;border-radius:7px;font-size:12px;cursor:pointer;">Pular</button>
        ${
          isLast
            ? '<button data-tour-done style="background:hsl(var(--primary));border:none;color:hsl(var(--primary-foreground));padding:7px 12px;border-radius:7px;font-size:12px;cursor:pointer;">Marcar concluído</button>'
            : '<button data-tour-next style="background:hsl(var(--primary));border:none;color:hsl(var(--primary-foreground));padding:7px 12px;border-radius:7px;font-size:12px;cursor:pointer;">Próximo</button>'
        }
      </div>
    `;
    layer.appendChild(tooltip);

    ensureTourStyles();
    document.body.appendChild(layer);

    const cleanup = () => layer.remove();
    tooltip.querySelector('[data-tour-close]')?.addEventListener('click', cleanup);
    tooltip.querySelector('[data-tour-skip]')?.addEventListener('click', cleanup);
    tooltip.querySelector('[data-tour-next]')?.addEventListener('click', () => {
      cleanup();
      onNext();
    });
    tooltip.querySelector('[data-tour-done]')?.addEventListener('click', () => {
      cleanup();
      onComplete();
    });
  }, 250);
}

function ensureTourStyles() {
  if (document.getElementById('setup-tour-style')) return;

  const style = document.createElement('style');
  style.id = 'setup-tour-style';
  style.textContent = `
    @keyframes setupTourPulse {
      0%, 100% { box-shadow: 0 0 0 9999px hsl(0 0% 0% / 0.55), 0 0 0 0 hsl(var(--primary) / 0.5); }
      50% { box-shadow: 0 0 0 9999px hsl(0 0% 0% / 0.55), 0 0 0 12px hsl(var(--primary) / 0); }
    }
  `;
  document.head.appendChild(style);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
