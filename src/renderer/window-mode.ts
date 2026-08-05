export type RendererWindowMode =
  | { kind: 'main' }
  | { kind: 'terminal'; terminalId: string }
  | { kind: 'backlog' };

export function getRendererWindowMode(search: string): RendererWindowMode {
  const params = new URLSearchParams(search);
  const terminalId = params.get('detachedTerminalId');
  if (terminalId) return { kind: 'terminal', terminalId };
  if (params.get('detachedBacklog') === '1') return { kind: 'backlog' };
  return { kind: 'main' };
}
