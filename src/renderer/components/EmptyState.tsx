import React, { useMemo } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { formatKeyForPlatform } from '../utils/platform';
import type { CopilotSessionSummary } from '../../shared/copilot-types';

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sessionTitle(s: CopilotSessionSummary): string {
  if (s.slug) return s.slug;
  if (s.repository && s.branch) return `${s.repository} · ${s.branch}`;
  if (s.repository) return s.repository;
  return s.cwd.split(/[\\/]/).pop() || s.cwd;
}

const ChevronLogo: React.FC = () => (
  <svg
    className="empty-state-logo"
    viewBox="0 0 220 100"
    aria-hidden="true"
    focusable="false"
  >
    {[0, 1, 2, 3].map((i) => (
      <polygon
        key={i}
        points={`${i * 45},10 ${i * 45 + 40},50 ${i * 45},90 ${i * 45 + 12},90 ${i * 45 + 52},50 ${i * 45 + 12},10`}
        className={`empty-state-chevron empty-state-chevron-${i}`}
      />
    ))}
  </svg>
);

const EmptyState: React.FC = () => {
  const createTerminal = useTerminalStore((s) => s.createTerminal);
  const openCopilot = useTerminalStore((s) => s.openCopilotSession);
  const openClaudeCode = useTerminalStore((s) => s.openClaudeCodeSession);
  const copilotSessions = useTerminalStore((s) => s.copilotSessions);
  const claudeCodeSessions = useTerminalStore((s) => s.claudeCodeSessions);

  const recentSessions = useMemo(() => {
    const all: CopilotSessionSummary[] = [...copilotSessions, ...claudeCodeSessions];
    return all
      .filter((s) => s.latestPromptTime)
      .sort((a, b) => (b.latestPromptTime || 0) - (a.latestPromptTime || 0))
      .slice(0, 5);
  }, [copilotSessions, claudeCodeSessions]);

  const newTerminalKey = formatKeyForPlatform('Ctrl+Shift+N');

  return (
    <div className="empty-state">
      <div className="empty-state-hero">
        <ChevronLogo />
        <div className="empty-state-wordmark">tmax</div>
      </div>

      <button
        className="empty-state-primary-action"
        onClick={() => createTerminal()}
      >
        <span className="empty-state-primary-icon">+</span>
        <span className="empty-state-primary-label">New terminal</span>
        <kbd className="empty-state-primary-kbd">{newTerminalKey}</kbd>
      </button>

      {recentSessions.length > 0 && (
        <div className="empty-state-recents">
          <div className="empty-state-recents-header">Resume recent session</div>
          <ul className="empty-state-recents-list">
            {recentSessions.map((s) => {
              const onClick = s.provider === 'copilot'
                ? () => openCopilot(s.id)
                : () => openClaudeCode(s.id);
              return (
                <li key={s.id}>
                  <button
                    className="empty-state-recent-item"
                    onClick={onClick}
                    title={s.cwd}
                  >
                    <span className={`empty-state-recent-badge empty-state-recent-badge-${s.provider}`}>
                      {s.provider === 'copilot' ? 'CP' : 'CC'}
                    </span>
                    <span className="empty-state-recent-main">
                      <span className="empty-state-recent-title">{sessionTitle(s)}</span>
                      {s.latestPrompt && (
                        <span className="empty-state-recent-prompt">{s.latestPrompt}</span>
                      )}
                    </span>
                    {s.latestPromptTime && (
                      <span className="empty-state-recent-time">{relativeTime(s.latestPromptTime)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
