import React, { useEffect, useRef, useState } from 'react';

interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** When true, render in danger style (red confirm). For destructive actions. */
  danger?: boolean;
}

interface PendingDialog extends DialogOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let nextId = 0;
let listener: ((d: PendingDialog | null) => void) | null = null;
let queue: PendingDialog[] = [];

function publish(): void {
  if (listener) listener(queue[0] ?? null);
}

/**
 * Promise-based replacement for window.confirm (TASK-115). Renders a
 * tmax-styled dialog instead of the platform-native browser one. Calls
 * outside React (e.g. from terminal-store actions) work the same way -
 * the imperative API doesn't depend on a React tree being available at
 * call time, only that <AppDialogHost /> is mounted somewhere.
 *
 * Multiple concurrent calls are queued: each resolves in order as the
 * user clicks through them.
 */
export function confirmDialog(opts: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...opts, id: ++nextId, resolve });
    publish();
  });
}

export function alertDialog(opts: Omit<DialogOptions, 'cancelText' | 'confirmText'> & { confirmText?: string }): Promise<void> {
  return new Promise((resolve) => {
    queue.push({
      ...opts,
      cancelText: '', // hides cancel button; alert is single-action
      id: ++nextId,
      resolve: () => resolve(),
    });
    publish();
  });
}

const ChevronLogo: React.FC = () => (
  <svg
    className="app-dialog-logo"
    viewBox="0 0 110 50"
    aria-hidden="true"
    focusable="false"
  >
    {[0, 1, 2, 3].map((i) => (
      <polygon
        key={i}
        points={`${i * 22},5 ${i * 22 + 20},25 ${i * 22},45 ${i * 22 + 6},45 ${i * 22 + 26},25 ${i * 22 + 6},5`}
        className={`app-dialog-chevron app-dialog-chevron-${i}`}
      />
    ))}
  </svg>
);

const AppDialogHost: React.FC = () => {
  const [active, setActive] = useState<PendingDialog | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    listener = setActive;
    publish();
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (active) {
      // Pull focus to the confirm button so Enter accepts. Defer one
      // frame so the button exists in the DOM by the time we focus it.
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    }
  }, [active]);

  if (!active) return null;

  const finish = (ok: boolean): void => {
    active.resolve(ok);
    queue.shift();
    publish();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(false);
    } else if (e.key === 'Enter') {
      e.stopPropagation();
      finish(true);
    }
  };

  const cancelText = active.cancelText ?? 'Cancel';
  const confirmText = active.confirmText ?? 'OK';

  return (
    <div
      className="app-dialog-overlay"
      onMouseDown={(e) => {
        // Click on the backdrop = cancel, like the existing settings/shortcuts
        // dialogs. Stop propagation so it doesn't drop pane focus etc.
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          finish(false);
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className={`app-dialog${active.danger ? ' app-dialog-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-dialog-header">
          <ChevronLogo />
          <span className="app-dialog-title">{active.title || 'tmax'}</span>
        </div>
        <div className="app-dialog-message">
          {active.message.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="app-dialog-actions">
          {cancelText && (
            <button
              type="button"
              className="app-dialog-btn app-dialog-btn-cancel"
              onClick={() => finish(false)}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`app-dialog-btn app-dialog-btn-confirm${active.danger ? ' app-dialog-btn-danger' : ''}`}
            onClick={() => finish(true)}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppDialogHost;
