import React, { useEffect, useMemo, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import type { McpGrant, McpGrantLevel, McpServerStatus } from '../../shared/mcp-types';

/**
 * Cross-pane MCP grants matrix dialog.
 *
 * Default-deny lives in the main process. This dialog is the user's surface
 * for changing the rules: who can read whose pane, and at what depth
 * (`buffer` ≈ raw scrollback, `session` ≈ structured agent events).
 *
 * Opens via Ctrl+Shift+M (see useKeybindings.ts) and via the future
 * "Share with agent..." pane context menu.
 */

interface PaneRow {
  id: string;
  title?: string;
  cwd?: string;
  aiSessionId?: string;
  provider?: 'copilot' | 'claude-code';
}

const McpGrantsDialog: React.FC = () => {
  const open = useTerminalStore((s) => s.showMcpGrants);
  const close = useTerminalStore((s) => s.toggleMcpGrants);
  const terminals = useTerminalStore((s) => s.terminals);

  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const [panes, setPanes] = useState<PaneRow[]>([]);
  const [granteeId, setGranteeId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<Array<{ ts: number; granteePane: string; targetPane: string; tool: string; argsSummary: string; ok: boolean; ms: number; error?: string }>>([]);

  // Pane list comes from main (registry includes pid + agent binding); we
  // also fall back to whatever we currently see in the renderer terminals
  // map so the dialog is usable even before the first pane snapshot has
  // been ack'd.
  const fallbackPanes = useMemo<PaneRow[]>(() => {
    const out: PaneRow[] = [];
    terminals.forEach((t) => {
      out.push({
        id: t.id,
        title: t.title,
        cwd: t.cwd,
        aiSessionId: t.aiSessionId,
      });
    });
    return out;
  }, [terminals]);

  const refresh = async () => {
    const api = (window as any).terminalAPI;
    if (!api) return;
    const [s, g, p] = await Promise.all([
      api.mcpGetStatus(),
      api.mcpListGrants(),
      api.mcpListPanes(),
    ]);
    setStatus(s);
    setGrants(g || []);
    setPanes((p && p.length ? p : fallbackPanes) as PaneRow[]);
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const api = (window as any).terminalAPI;
    const offGrants = api?.onMcpGrantsChanged?.((next: McpGrant[]) => setGrants(next));
    const offPanes = api?.onMcpPanesChanged?.((next: PaneRow[]) => setPanes(next.length ? next : fallbackPanes));
    return () => {
      offGrants?.();
      offPanes?.();
    };
  }, [open, fallbackPanes]);

  if (!open) return null;

  // Reconcile main-process registry against renderer-live terminals: any
  // pane the renderer no longer knows about is stale (its PTY exited but
  // the registry didn't get the unregister call). Hide those rows so the
  // dialog only shows actual, live panes.
  const liveIds = new Set<string>();
  terminals.forEach((_t, id) => liveIds.add(id));
  const allPanes = (panes.length ? panes : fallbackPanes).filter((p) => liveIds.size === 0 || liveIds.has(p.id));
  const grantee = granteeId ?? allPanes[0]?.id ?? null;
  const otherPanes = allPanes.filter((p) => p.id !== grantee);

  const grantFor = (target: string): McpGrant | undefined =>
    grants.find((g) => g.granteePane === grantee && g.targetPane === target);

  const setLevel = async (target: string, level: McpGrantLevel | 'none') => {
    const api = (window as any).terminalAPI;
    if (!api || !grantee) return;
    if (level === 'none') {
      await api.mcpRevoke(grantee, target);
    } else {
      await api.mcpGrant(grantee, target, level);
    }
    refresh();
  };

  const revokeAll = async () => {
    const api = (window as any).terminalAPI;
    if (!api) return;
    if (!confirm('Revoke every cross-pane MCP grant?')) return;
    await api.mcpRevokeAll();
    refresh();
  };

  const toggleEnabled = async () => {
    const api = (window as any).terminalAPI;
    if (!api) return;
    const next = !(status?.enabled ?? true);
    const r = await api.mcpSetEnabled(next);
    setStatus((prev) => (prev ? { ...prev, enabled: r.enabled, url: r.url } : prev));
    refresh();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e1e',
          color: '#e8e8e8',
          border: '1px solid #3a3a3a',
          borderRadius: 8,
          minWidth: 640,
          maxWidth: 880,
          maxHeight: '80vh',
          padding: 20,
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          fontSize: 13,
          overflow: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Cross-pane MCP grants</div>
            <div style={{ color: '#888', marginTop: 4 }}>
              Default-deny. The agent in the <em>grantee</em> pane will be able to read the chosen targets.
            </div>
          </div>
          <button onClick={close} style={btnStyle}>Close</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #2c2c2c' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={status?.enabled ?? true} onChange={toggleEnabled} />
            MCP server enabled
          </label>
          <span style={{ color: '#888', fontFamily: 'monospace' }}>
            {status?.url ?? 'stopped'}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={revokeAll} style={dangerBtnStyle}>Revoke all</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ marginRight: 8, color: '#aaa' }}>Grantee pane (the reader):</label>
          <select
            value={grantee ?? ''}
            onChange={(e) => setGranteeId(e.target.value)}
            style={selectStyle}
          >
            {allPanes.map((p) => (
              <option key={p.id} value={p.id}>
                {paneLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'left' }}>
              <th style={thStyle}>Target pane</th>
              <th style={thStyle}>Current level</th>
              <th style={thStyle}>Set</th>
            </tr>
          </thead>
          <tbody>
            {otherPanes.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: '#666' }}>
                  No other panes to grant access to.
                </td>
              </tr>
            )}
            {otherPanes.map((p) => {
              const cur = grantFor(p.id)?.level ?? 'none';
              return (
                <tr key={p.id} style={{ borderTop: '1px solid #2c2c2c' }}>
                  <td style={tdStyle}>{paneLabel(p)}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: cur === 'none' ? '#3a2222' : cur === 'session' ? '#1f3a1f' : '#22324a',
                      color: '#ddd',
                      fontFamily: 'monospace',
                    }}>{cur}</span>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => setLevel(p.id, 'none')} style={cur === 'none' ? activeBtnStyle : btnStyle}>None</button>
                    <button onClick={() => setLevel(p.id, 'buffer')} style={cur === 'buffer' ? activeBtnStyle : btnStyle}>Buffer</button>
                    <button onClick={() => setLevel(p.id, 'session')} style={cur === 'session' ? activeBtnStyle : btnStyle}>Session</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
          <strong>Buffer</strong>: visible scrollback (ANSI stripped). <strong>Session</strong>: structured agent events from the recognized CLI agent's session log (Copilot CLI / Claude Code).
        </div>

        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid #2c2c2c' }}>
          <button
            onClick={async () => {
              const next = !showAudit;
              setShowAudit(next);
              if (next) {
                const api = (window as any).terminalAPI;
                const entries = await api?.mcpGetAudit?.(50);
                setAudit(entries || []);
              }
            }}
            style={btnStyle}
          >
            {showAudit ? 'Hide' : 'Show'} recent tool calls
          </button>
          {status?.auditLogPath && (
            <span style={{ marginLeft: 10, color: '#777', fontFamily: 'monospace', fontSize: 11 }}>
              {status.auditLogPath}
            </span>
          )}
          {showAudit && (
            <div style={{ marginTop: 10, maxHeight: 200, overflow: 'auto', background: '#161616', border: '1px solid #2c2c2c', borderRadius: 4, padding: 8 }}>
              {audit.length === 0 ? (
                <div style={{ color: '#666' }}>No tool calls yet.</div>
              ) : (
                audit.slice().reverse().map((e, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 0', color: e.ok ? '#9cb' : '#e88' }}>
                    {new Date(e.ts).toLocaleTimeString()} {e.granteePane.slice(0, 8)} → {e.targetPane.slice(0, 8) || '—'} {e.tool}({e.argsSummary}) {e.ms}ms {e.ok ? 'ok' : `ERR: ${e.error ?? ''}`}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function paneLabel(p: PaneRow): string {
  const tag = p.aiSessionId ? ' [agent]' : '';
  return `${p.title || p.id}${tag}${p.cwd ? '  —  ' + p.cwd : ''}`;
}

const btnStyle: React.CSSProperties = {
  background: '#2c2c2c',
  color: '#ddd',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  padding: '4px 10px',
  marginRight: 6,
  cursor: 'pointer',
  fontSize: 12,
};
const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#0a5a8a',
  borderColor: '#1d7bb6',
  color: '#fff',
};
const dangerBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#5a1a1a',
  borderColor: '#8a2222',
  color: '#fff',
};
const thStyle: React.CSSProperties = { padding: '6px 8px', fontWeight: 500, borderBottom: '1px solid #2c2c2c' };
const tdStyle: React.CSSProperties = { padding: '8px', verticalAlign: 'middle' };
const selectStyle: React.CSSProperties = {
  background: '#2c2c2c',
  color: '#ddd',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
};

export default McpGrantsDialog;
