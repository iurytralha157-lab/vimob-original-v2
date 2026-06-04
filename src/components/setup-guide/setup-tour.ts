/**
 * Setup tour: highlights a target element on the page with an overlay
 * and a tooltip explaining what to do. Auto-completes the step when
 * the user clicks the highlighted element or completes the action.
 */

import type { SetupStepId } from '@/hooks/use-setup-guide';

interface TourOptions {
  target: string;
  stepId: SetupStepId;
  onComplete: () => void;
}

const TOUR_MESSAGES: Record<string, { title: string; body: string }> = {
  'whatsapp-new-session': {
    title: 'Conecte seu WhatsApp',
    body: 'Clique aqui para criar uma nova sessão e escanear o QR Code com seu celular.',
  },
  'pipeline-new-lead': {
    title: 'Crie seu primeiro lead',
    body: 'Clique aqui para adicionar um novo lead manualmente ao seu pipeline.',
  },
  'team-add-user': {
    title: 'Adicione um corretor',
    body: 'Clique aqui para convidar um novo membro à sua equipe. Ele receberá login e senha pelo WhatsApp.',
  },
  'distribution-new-queue': {
    title: 'Crie uma fila',
    body: 'Clique aqui para configurar como os leads serão distribuídos automaticamente.',
  },
  'automations-new': {
    title: 'Crie uma automação',
    body: 'Clique aqui para começar uma nova automação de mensagens.',
  },
};

export function startSetupTour({ target, stepId, onComplete }: TourOptions) {
  // Wait for the target element to appear (max ~5s)
  let attempts = 0;
  const maxAttempts = 25;

  const tryStart = () => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) {
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(tryStart, 200);
      }
      return;
    }
    showTour(el, target, stepId, onComplete);
  };

  tryStart();
}

function showTour(
  el: HTMLElement,
  target: string,
  stepId: SetupStepId,
  onComplete: () => void
) {
  const msg = TOUR_MESSAGES[target] || {
    title: 'Próximo passo',
    body: 'Clique aqui para continuar.',
  };

  // Cleanup any previous tour
  document.querySelectorAll('.setup-tour-layer').forEach((n) => n.remove());

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

  const rect = el.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'setup-tour-layer';
  layer.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9998;
    pointer-events: none;
  `;

  // Dark overlay with cutout via box-shadow
  const overlay = document.createElement('div');
  const padding = 8;
  overlay.style.cssText = `
    position: absolute;
    top: ${rect.top - padding}px;
    left: ${rect.left - padding}px;
    width: ${rect.width + padding * 2}px;
    height: ${rect.height + padding * 2}px;
    border-radius: 12px;
    box-shadow: 0 0 0 9999px hsl(0 0% 0% / 0.55);
    border: 2px solid hsl(var(--primary));
    transition: all 0.2s ease;
    pointer-events: none;
    animation: setupTourPulse 1.6s ease-in-out infinite;
  `;
  layer.appendChild(overlay);

  // Tooltip
  const tooltip = document.createElement('div');
  const tooltipTop =
    rect.bottom + 16 + 140 > window.innerHeight
      ? rect.top - 140 - 16
      : rect.bottom + 16;
  const tooltipLeft = Math.max(
    16,
    Math.min(window.innerWidth - 320 - 16, rect.left + rect.width / 2 - 160)
  );

  tooltip.style.cssText = `
    position: absolute;
    top: ${tooltipTop}px;
    left: ${tooltipLeft}px;
    width: 320px;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 10px 40px hsl(0 0% 0% / 0.25);
    pointer-events: auto;
    font-family: inherit;
  `;

  tooltip.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">
      <h4 style="font-size:14px;font-weight:600;margin:0;">${msg.title}</h4>
      <button data-tour-close style="background:none;border:none;color:hsl(var(--muted-foreground));cursor:pointer;padding:0;line-height:1;">✕</button>
    </div>
    <p style="font-size:13px;color:hsl(var(--muted-foreground));margin:0 0 12px 0;line-height:1.5;">${msg.body}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button data-tour-skip style="background:none;border:1px solid hsl(var(--border));color:hsl(var(--foreground));padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Pular</button>
      <button data-tour-done style="background:hsl(var(--primary));border:none;color:hsl(var(--primary-foreground));padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Marcar concluído</button>
    </div>
  `;
  layer.appendChild(tooltip);

  // Inject keyframes once
  if (!document.getElementById('setup-tour-style')) {
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

  document.body.appendChild(layer);

  const cleanup = () => {
    layer.remove();
    el.removeEventListener('click', handleTargetClick);
  };

  const handleTargetClick = () => {
    onComplete();
    cleanup();
  };

  // Allow click-through to the target
  el.addEventListener('click', handleTargetClick, { once: true });

  tooltip.querySelector('[data-tour-close]')?.addEventListener('click', cleanup);
  tooltip.querySelector('[data-tour-skip]')?.addEventListener('click', cleanup);
  tooltip.querySelector('[data-tour-done]')?.addEventListener('click', () => {
    onComplete();
    cleanup();
  });

  // Make sure overlay click does NOT block target — extend pointer-events selectively
  // Create transparent click-catcher around the cutout area to swallow other clicks
  const blocker = document.createElement('div');
  blocker.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: auto;
    background: transparent;
  `;
  blocker.addEventListener('click', (e) => {
    // If clicking on the highlighted area, let it through
    const x = e.clientX;
    const y = e.clientY;
    if (
      x >= rect.left - padding &&
      x <= rect.right + padding &&
      y >= rect.top - padding &&
      y <= rect.bottom + padding
    ) {
      cleanup();
      el.click();
    }
  });
  layer.insertBefore(blocker, overlay);
}
