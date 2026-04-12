import React, { useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../state/terminal-store';

const FloatingRenameInput: React.FC = () => {
  const renamingTerminalId = useTerminalStore((s) => s.renamingTerminalId);
  const hideTabTitles = useTerminalStore((s) => s.hideTabTitles);
  const terminalTitle = useTerminalStore((s) => (
    renamingTerminalId ? s.terminals.get(renamingTerminalId)?.title ?? '' : ''
  ));
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const shouldShow = hideTabTitles && renamingTerminalId !== null;

  useEffect(() => {
    if (!shouldShow) return;

    setRenameValue(terminalTitle);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [shouldShow, terminalTitle]);

  if (!shouldShow || !renamingTerminalId) return null;

  const handleCancel = () => {
    useTerminalStore.getState().startRenaming(null);
  };

  const handleSubmit = () => {
    if (renameValue.trim()) {
      useTerminalStore.getState().renameTerminal(renamingTerminalId, renameValue.trim(), true);
    }
    useTerminalStore.getState().startRenaming(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className="floating-rename-overlay">
      <div className="floating-rename-box">
        <input
          ref={inputRef}
          className="rename-input"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSubmit}
        />
      </div>
    </div>
  );
};

export default FloatingRenameInput;
