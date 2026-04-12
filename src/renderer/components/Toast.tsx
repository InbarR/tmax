import React from 'react';
import { useTerminalStore } from '../state/terminal-store';

const Toast: React.FC = () => {
  const toasts = useTerminalStore((s) => s.toastNotifications);
  const dismissToast = useTerminalStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-notification">
          <span className="toast-message">{toast.message}</span>
          <button className="toast-dismiss" onClick={() => dismissToast(toast.id)}>✕</button>
        </div>
      ))}
    </div>
  );
};

export default Toast;
