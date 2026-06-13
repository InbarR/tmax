import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { useTerminalStore } from '../state/terminal-store';
import type { LayoutNode, LayoutSplitNode } from '../state/types';
import TerminalPanel from './TerminalPanel';
import SplitResizer from './SplitResizer';
import PaneDropZones from './PaneDropZones';
import EmptyState from './EmptyState';

// Thin wrapper that subscribes to the per-pane refresh generation and uses
// it in the React key on TerminalPanel. Bumping the generation (via the
// store's refreshTerminal action) forces React to unmount + remount the
// xterm wrapper, which clears renderer-side stalls without touching the
// PTY (it lives in main). TASK-156 / GH #101.
const RefreshableTerminalPanel: React.FC<{ terminalId: string }> = ({ terminalId }) => {
  const generation = useTerminalStore((s) => s.refreshGenerations[terminalId] ?? 0);
  return <TerminalPanel key={`${terminalId}-${generation}`} terminalId={terminalId} />;
};

// TASK-158: stable per-terminal host registry. Each leaf gets a persistent
// detached <div.pane-host> that holds the portaled TerminalPanel. Leaf slots
// re-parent this node as the tree reshapes; the TerminalPanel itself is mounted
// once via createPortal from <PanePortals> (a stable React position) so its
// xterm instance - and thus the live text selection + mouse-tracking state -
// survives splits/un-splits instead of being torn down and recreated.
//
// Why this is needed: TilingNode is recursive, so opening the first split flips
// the ROOT node from leaf to split and the existing pane's DOM ancestor chain
// changes (moves under a new <div.split-container>). React reconciles by tree
// position, so the pre-existing TerminalPanel was unmounted+remounted and xterm
// was recreated - wiping the selection the moment a second pane appeared.
type GetHost = (terminalId: string, ownerDoc?: Document) => HTMLDivElement;
const PaneHostContext = createContext<GetHost | null>(null);

interface TilingNodeProps {
  node: LayoutNode;
}

/** Helper to get a stable key for a LayoutNode, ensuring React tracks
 *  each TilingNode instance by its logical identity rather than tree position. */
function getNodeKey(node: LayoutNode): string {
  return node.kind === 'leaf' ? node.terminalId : node.id;
}

/** Leaf renderer. Owns the <div.tiling-leaf> and a host slot into which the
 *  stable per-terminal host node is re-parented. The TerminalPanel is NOT a
 *  child here - it is portaled into the host node by <PanePortals> - so this
 *  slot can remount freely as the tree reshapes without disturbing xterm. */
const TilingLeaf: React.FC<{ terminalId: string }> = ({ terminalId }) => {
  const getHost = useContext(PaneHostContext);
  const attachHost = useCallback(
    (slot: HTMLDivElement | null) => {
      if (!slot || !getHost) return;
      const host = getHost(terminalId, slot.ownerDocument);
      // appendChild moves the (possibly already-mounted-elsewhere) host node
      // into this slot, relocating its xterm subtree without destroying it.
      if (host.parentElement !== slot) slot.appendChild(host);
    },
    [terminalId, getHost],
  );

  return (
    <div className="tiling-leaf">
      <div className="pane-host-slot" ref={attachHost} />
      <PaneDropZones terminalId={terminalId} />
    </div>
  );
};

const TilingNode: React.FC<TilingNodeProps> = ({ node }) => {
  if (node.kind === 'leaf') {
    return <TilingLeaf terminalId={node.terminalId} />;
  }

  const splitNode = node as LayoutSplitNode;
  const isHorizontal = splitNode.direction === 'horizontal';
  const firstBasis = `${splitNode.splitRatio * 100}%`;
  const secondBasis = `${(1 - splitNode.splitRatio) * 100}%`;

  return (
    <div className={`split-container ${splitNode.direction}`}>
      <div
        key={getNodeKey(splitNode.first)}
        style={{
          flexBasis: firstBasis,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          minWidth: isHorizontal ? 120 : undefined,
          minHeight: !isHorizontal ? 60 : undefined,
        }}
      >
        <TilingNode node={splitNode.first} />
      </div>
      <SplitResizer
        splitNodeId={splitNode.id}
        direction={splitNode.direction}
      />
      <div
        key={getNodeKey(splitNode.second)}
        style={{
          flexBasis: secondBasis,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          minWidth: isHorizontal ? 120 : undefined,
          minHeight: !isHorizontal ? 60 : undefined,
        }}
      >
        <TilingNode node={splitNode.second} />
      </div>
    </div>
  );
};

/** Mounts each leaf's TerminalPanel exactly once, portaled into its stable
 *  host node. Rendered at a fixed position in the layout tree so the portals -
 *  and therefore the xterm instances - never unmount when the tiling tree is
 *  restructured (TASK-158). */
const PanePortals: React.FC<{ leafIds: string[]; getHost: GetHost }> = ({ leafIds, getHost }) => {
  return (
    <>
      {leafIds.map((id) =>
        createPortal(<RefreshableTerminalPanel terminalId={id} />, getHost(id), id),
      )}
    </>
  );
};

/** Thin drop zone on the edge of the layout area for full-height/width drops */
const RootEdgeZone: React.FC<{ side: string; className: string; label: string }> = ({ side, className, label }) => {
  const { isOver, setNodeRef } = useDroppable({ id: `drop:root:${side}` });
  return (
    <div ref={setNodeRef} className={`root-edge-zone ${className}${isOver ? ' active' : ''}`}>
      {isOver && <span className="drop-label">{label}</span>}
    </div>
  );
};

const RootDropZones: React.FC = () => {
  const isDragging = useTerminalStore((s) => s.isDragging);
  if (!isDragging) return null;
  return (
    <>
      <RootEdgeZone side="left" className="root-zone-left" label="← Full Left" />
      <RootEdgeZone side="right" className="root-zone-right" label="Full Right →" />
      <RootEdgeZone side="top" className="root-zone-top" label="↑ Full Top" />
      <RootEdgeZone side="bottom" className="root-zone-bottom" label="Full Bottom ↓" />
    </>
  );
};

/** Walk a layout tree and collect leaf terminal IDs in tiling order
 *  (left-to-right / top-to-bottom). Used by the focus-mode pane indicator
 *  to render one dot per pane. */
function collectLeafIds(node: LayoutNode): string[] {
  if (node.kind === 'leaf') return [node.terminalId];
  const split = node as LayoutSplitNode;
  return [...collectLeafIds(split.first), ...collectLeafIds(split.second)];
}

/** Floating indicator in focus mode that surfaces "you have N panes, here's
 *  which one is focused, click a dot to switch." TASK-82 - in workspaces +
 *  focus mode the tab bar is hidden, leaving Ctrl+Tab as the only way to
 *  switch panes; new users had no signal that switching was even possible. */
const FocusModePaneIndicator: React.FC<{ leafIds: string[]; focusedId: string | null }> = ({ leafIds, focusedId }) => {
  const terminals = useTerminalStore((s) => s.terminals);
  const setFocus = useTerminalStore((s) => s.setFocus);
  if (leafIds.length < 2) return null;
  return (
    <div className="focus-mode-pane-indicator" role="tablist" aria-label="Switch pane">
      {leafIds.map((id) => {
        const t = terminals.get(id);
        const title = t?.title || (t as { customTitle?: string } | undefined)?.customTitle || id.slice(0, 8);
        const active = id === focusedId;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`focus-mode-pane-dot${active ? ' active' : ''}`}
            title={`${title}${active ? ' (focused)' : ' - click to focus'}`}
            onClick={() => setFocus(id)}
          />
        );
      })}
    </div>
  );
};

const SessionLoading: React.FC = () => (
  <div className="session-loading" role="status" aria-live="polite" aria-label="Restoring previous session">
    <div className="session-loading-spinner" />
    <div className="session-loading-text">Restoring session...</div>
  </div>
);

const TilingLayout: React.FC = () => {
  const tilingRoot = useTerminalStore((s) => s.layout.tilingRoot);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const focusedTerminalId = useTerminalStore((s) => s.focusedTerminalId);
  const isRestoring = useTerminalStore((s) => s.isRestoring);

  // TASK-158: persistent host nodes keyed by terminalId. Lazily created and
  // reused across tree reshapes so the portaled TerminalPanel never remounts.
  const hostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const getHost = useCallback<GetHost>((terminalId, ownerDoc) => {
    const map = hostsRef.current;
    let host = map.get(terminalId);
    if (!host) {
      host = (ownerDoc ?? document).createElement('div');
      host.className = 'pane-host';
      host.dataset.paneHost = terminalId;
      map.set(terminalId, host);
    }
    return host;
  }, []);

  const leafIds = useMemo(() => (tilingRoot ? collectLeafIds(tilingRoot) : []), [tilingRoot]);

  // Drop host nodes for terminals that no longer have a tiled leaf (closed,
  // or moved to a floating panel) so they can be garbage-collected.
  useEffect(() => {
    const map = hostsRef.current;
    const live = new Set(leafIds);
    for (const id of Array.from(map.keys())) {
      if (!live.has(id)) map.delete(id);
    }
  }, [leafIds]);

  if (!tilingRoot) {
    // TASK-117: while session restore is in flight, render a neutral
    // loading indicator instead of the empty-state hero. The hero showing
    // mid-restore made users think their panes were lost. Once restore
    // completes - either by attaching panes (which sets tilingRoot) or
    // by confirming nothing to restore (which clears isRestoring) - we
    // fall through to <EmptyState />.
    if (isRestoring) {
      return <SessionLoading />;
    }
    return <EmptyState />;
  }

  // Always render a stable wrapper div so React never unmounts the TilingNode tree
  // on mode changes. Changing the root element type (div vs TilingNode) would cause
  // a full remount, destroying xterm instances and losing input focus.
  // In focus mode the CSS class hides non-focused panes via visibility tricks.
  // In normal mode display:contents makes the wrapper transparent to layout.
  return (
    <PaneHostContext.Provider value={getHost}>
      <div className={viewMode === 'focus' ? 'tiling-focus-mode' : 'tiling-normal-mode'}>
        <TilingNode node={tilingRoot} />
        <PanePortals leafIds={leafIds} getHost={getHost} />
        <RootDropZones />
        {viewMode === 'focus' && (
          <FocusModePaneIndicator
            leafIds={leafIds}
            focusedId={focusedTerminalId}
          />
        )}
      </div>
    </PaneHostContext.Provider>
  );
};

export default TilingLayout;
