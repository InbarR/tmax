import React, { useEffect, useState, useCallback } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { LayoutNode } from '../state/types';

const HINT_KEYS = 'asdfghjklqwertyuiopzxcvbnm';

function collectLeafIds(node: LayoutNode | null): string[] {
  if (!node) return [];
  if (node.kind === 'leaf') return [node.terminalId];
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

const PaneHintOverlay: React.FC = () => {
  const show = useTerminalStore((s) => s.showPaneHints);
  const tilingRoot = useTerminalStore((s) => s.layout.tilingRoot);
  const [hints, setHints] = useState<{ key: string; terminalId: string; rect: DOMRect }[]>([]);

  // Build hint positions from DOM once overlay becomes visible
  useEffect(() => {
    if (!show) {
      setHints([]);
      return;
    }

    const leafIds = collectLeafIds(tilingRoot);
    const computed: typeof hints = [];

    for (let i = 0; i < leafIds.length && i < HINT_KEYS.length; i++) {
      const terminalId = leafIds[i];
      // Find the .tiling-leaf element that contains this terminal's xterm-container
      const xtermEl = document.querySelector(
        `.terminal-panel[data-terminal-id="${terminalId}"]`
      );
      const leafEl = xtermEl?.closest('.tiling-leaf');
      if (leafEl) {
        computed.push({
          key: HINT_KEYS[i],
          terminalId,
          rect: leafEl.getBoundingClientRect(),
        });
      }
    }

    setHints(computed);
  }, [show, tilingRoot]);

  const dismiss = useCallback(() => {
    useTerminalStore.getState().togglePaneHints();
  }, []);

  const selectPane = useCallback((terminalId: string) => {
    useTerminalStore.getState().setFocus(terminalId);
    useTerminalStore.getState().togglePaneHints();
  }, []);

  // Listen for key presses while hints are visible
  useEffect(() => {
    if (!show || hints.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        dismiss();
        return;
      }

      const pressed = e.key.toLowerCase();
      const match = hints.find((h) => h.key === pressed);
      if (match) {
        selectPane(match.terminalId);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [show, hints, dismiss, selectPane]);

  if (!show || hints.length === 0) return null;

  return (
    <div className="pane-hint-backdrop" onClick={dismiss}>
      {hints.map((hint) => (
        <div
          key={hint.terminalId}
          className="pane-hint-label"
          style={{
            left: hint.rect.left + hint.rect.width / 2,
            top: hint.rect.top + hint.rect.height / 2,
          }}
          onClick={(e) => {
            e.stopPropagation();
            selectPane(hint.terminalId);
          }}
        >
          {hint.key}
        </div>
      ))}
    </div>
  );
};

export default PaneHintOverlay;
