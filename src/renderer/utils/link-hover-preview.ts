const HOVER_DELAY_MS = 350;
const POINTER_OFFSET_PX = 12;
const VIEWPORT_MARGIN_PX = 8;

export interface LinkHoverPreview {
  show(event: MouseEvent, url: string): void;
  leave(): void;
  hide(): void;
  dispose(): void;
}

export function computeLinkPreviewPosition(
  pointer: { x: number; y: number },
  preview: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, viewport.width - preview.width - VIEWPORT_MARGIN_PX);
  const left = Math.min(Math.max(VIEWPORT_MARGIN_PX, pointer.x + POINTER_OFFSET_PX), maxLeft);

  const below = pointer.y + POINTER_OFFSET_PX;
  const above = pointer.y - preview.height - POINTER_OFFSET_PX;
  const top = below + preview.height + VIEWPORT_MARGIN_PX <= viewport.height
    ? below
    : Math.max(VIEWPORT_MARGIN_PX, above);

  return { left, top };
}

export function createLinkHoverPreview(
  getHost: () => HTMLElement | null | undefined,
  delayMs = HOVER_DELAY_MS,
): LinkHoverPreview {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  let element: HTMLDivElement | null = null;
  let currentUrl: string | null = null;
  let disposed = false;

  const hide = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    element?.remove();
    element = null;
    currentUrl = null;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide();
  };
  document.addEventListener('keydown', handleKeyDown, true);

  return {
    show(event, url) {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (currentUrl === url && (timer || element)) return;

      hide();
      currentUrl = url;
      const pointer = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        timer = null;
        if (disposed) return;
        const host = getHost();
        if (!host) return;

        element = document.createElement('div');
        element.className = 'xterm-hover terminal-link-preview';
        element.setAttribute('role', 'tooltip');
        element.textContent = url;
        element.style.left = `${pointer.x + POINTER_OFFSET_PX}px`;
        element.style.top = `${pointer.y + POINTER_OFFSET_PX}px`;
        host.appendChild(element);

        const rect = element.getBoundingClientRect();
        const position = computeLinkPreviewPosition(
          pointer,
          { width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
        );
        element.style.left = `${position.left}px`;
        element.style.top = `${position.top}px`;
      }, delayMs);
    },
    leave() {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(hide, 50);
    },
    hide,
    dispose() {
      disposed = true;
      hide();
      document.removeEventListener('keydown', handleKeyDown, true);
    },
  };
}
