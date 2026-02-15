import React, { useEffect } from 'react';

interface ShortcutsHelpProps {
  onClose: () => void;
}

const shortcuts = [
  { category: 'Terminals', items: [
    { key: 'Ctrl+Shift+N', action: 'New terminal' },
    { key: 'Ctrl+Shift+W', action: 'Close terminal' },
    { key: 'Ctrl+Shift+R', action: 'Rename terminal' },
    { key: 'Ctrl+Shift+G', action: 'Jump to terminal by name' },
    { key: 'Ctrl+Shift+P', action: 'Command palette' },
    { key: 'Ctrl+Shift+D', action: 'Go to directory (favorites & recent)' },
  ]},
  { category: 'Navigation', items: [
    { key: 'Shift+Arrow', action: 'Move focus between panes' },
    { key: 'Ctrl+Shift+Arrow', action: 'Move/swap terminal in direction' },
  ]},
  { category: 'Layout', items: [
    { key: 'Ctrl+Alt+Arrow', action: 'Split in direction' },
    { key: 'Ctrl+Shift+F', action: 'Toggle float / dock' },
    { key: 'Ctrl+Shift+Alt+Arrow', action: 'Resize pane' },
    { key: 'Ctrl+Shift+E', action: 'Equalize all pane sizes' },
  ]},
  { category: 'Zoom', items: [
    { key: 'Ctrl+ + / Ctrl+Scroll Up', action: 'Zoom in' },
    { key: 'Ctrl+ - / Ctrl+Scroll Down', action: 'Zoom out' },
    { key: 'Ctrl+0', action: 'Reset zoom' },
  ]},
  { category: 'Other', items: [
    { key: 'Ctrl+Shift+?', action: 'Show this help' },
    { key: 'Double-click tab', action: 'Rename terminal' },
    { key: 'Right-click tab', action: 'Context menu' },
    { key: 'Drag tab', action: 'Rearrange / split / float' },
  ]},
];

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span>Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>&#10005;</button>
        </div>
        <div className="shortcuts-body">
          {shortcuts.map((group) => (
            <div key={group.category} className="shortcuts-group">
              <div className="shortcuts-category">{group.category}</div>
              {group.items.map((item) => (
                <div key={item.key} className="shortcuts-row">
                  <kbd className="shortcuts-key">{item.key}</kbd>
                  <span className="shortcuts-action">{item.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
