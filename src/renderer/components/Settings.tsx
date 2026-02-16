import React, { useState, useCallback, useEffect } from 'react';
import { useTerminalStore } from '../state/terminal-store';

type Tab = 'terminal' | 'keybindings' | 'shells' | 'theme';

const Settings: React.FC = () => {
  const show = useTerminalStore((s) => s.showSettings);
  const config = useTerminalStore((s) => s.config);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const [tab, setTab] = useState<Tab>('terminal');

  useEffect(() => {
    if (!show) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        useTerminalStore.getState().toggleSettings();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [show]);

  if (!show || !config) return null;

  const close = () => useTerminalStore.getState().toggleSettings();

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="shortcuts-close" onClick={close}>&#10005;</button>
        </div>
        <div className="settings-tabs">
          {(['terminal', 'keybindings', 'shells', 'theme'] as Tab[]).map((t) => (
            <button key={t} className={`settings-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {tab === 'terminal' && <TerminalSettings />}
          {tab === 'keybindings' && <KeybindingsSettings />}
          {tab === 'shells' && <ShellsSettings />}
          {tab === 'theme' && <ThemeSettings />}
        </div>
      </div>
    </div>
  );
};

// ── Terminal Settings ──────────────────────────────────────────────

const TerminalSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const fontSize = useTerminalStore((s) => s.fontSize);
  const update = useTerminalStore((s) => s.updateConfig);

  const applyDefaultColor = (color: string) => {
    update({ defaultTabColor: color } as any);
  };

  return (
    <div className="settings-section">
      <SettingRow label="Font Size" description="Terminal font size in pixels">
        <input type="number" className="settings-input small" value={config.terminal.fontSize}
          onChange={(e) => update({ terminal: { ...config.terminal, fontSize: parseInt(e.target.value) || 14 } })} />
      </SettingRow>
      <SettingRow label="Font Family" description="CSS font family string">
        <input type="text" className="settings-input" value={config.terminal.fontFamily}
          onChange={(e) => update({ terminal: { ...config.terminal, fontFamily: e.target.value } })} />
      </SettingRow>
      <SettingRow label="Scrollback" description="Number of lines to keep in scroll buffer">
        <input type="number" className="settings-input small" value={config.terminal.scrollback}
          onChange={(e) => update({ terminal: { ...config.terminal, scrollback: parseInt(e.target.value) || 5000 } })} />
      </SettingRow>
      <SettingRow label="Default Shell" description="Shell used for new terminals">
        <select className="settings-input" value={config.defaultShellId}
          onChange={(e) => update({ defaultShellId: e.target.value })}>
          {config.shells.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </SettingRow>
      <SettingRow label="Default Start Folder" description="Global default working directory (shell-specific overrides this)">
        <input type="text" className="settings-input" value={(config as any).defaultCwd || ''}
          placeholder="e.g. C:\Projects"
          onChange={(e) => update({ defaultCwd: e.target.value } as any)} />
      </SettingRow>
      <SettingRow label="Default Tab Color" description="Background tint for all terminals without a custom color">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="color" className="theme-color-picker"
            value={(config as any).defaultTabColor || '#1e1e2e'}
            onChange={(e) => { applyDefaultColor(e.target.value); }} />
          <input type="text" className="settings-input small"
            value={(config as any).defaultTabColor || ''}
            placeholder="e.g. #f38ba8"
            onChange={(e) => { applyDefaultColor(e.target.value); }} />
          <button className="settings-reset-btn" onClick={() => { applyDefaultColor(''); }}>
            Reset
          </button>
        </div>
      </SettingRow>
    </div>
  );
};

// ── Keybindings Settings ──────────────────────────────────────────

const KeybindingsSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);
  const [recording, setRecording] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  const filteredBindings = config.keybindings.map((b, i) => ({ ...b, originalIndex: i })).filter((b) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return formatAction(b.action).toLowerCase().includes(q) || b.key.toLowerCase().includes(q);
  });

  const handleRecord = useCallback((index: number) => {
    setRecording(index);
  }, []);

  useEffect(() => {
    if (recording === null) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      let key = e.key;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return; // wait for actual key

      // Normalize key names
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();
      parts.push(key);

      const combo = parts.join('+');
      const newBindings = [...config.keybindings];
      newBindings[recording] = { ...newBindings[recording], key: combo };
      update({ keybindings: newBindings });
      setRecording(null);
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [recording, config.keybindings, update]);

  return (
    <div className="settings-section">
      <input
        className="settings-input keybinding-filter"
        type="text"
        placeholder="Search keybindings..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="settings-hint">Click a shortcut to re-record it. Press any key combination.</div>
      {filteredBindings.map((binding) => (
        <div key={binding.originalIndex} className="keybinding-row">
          <span className="keybinding-action">{formatAction(binding.action)}</span>
          <button
            className={`keybinding-key${recording === binding.originalIndex ? ' recording' : ''}`}
            onClick={() => handleRecord(binding.originalIndex)}
          >
            {recording === binding.originalIndex ? 'Press keys...' : binding.key}
          </button>
        </div>
      ))}
    </div>
  );
};

function formatAction(action: string): string {
  return action
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ── Shells Settings ───────────────────────────────────────────────

const ShellsSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);

  const updateShell = (index: number, field: string, value: string) => {
    const newShells = [...config.shells];
    newShells[index] = { ...newShells[index], [field]: value };
    update({ shells: newShells });
  };

  const addShell = () => {
    update({
      shells: [...config.shells, { id: `shell-${Date.now()}`, name: 'New Shell', path: '', args: [] }],
    });
  };

  const removeShell = (index: number) => {
    const newShells = config.shells.filter((_, i) => i !== index);
    update({ shells: newShells });
  };

  return (
    <div className="settings-section">
      {config.shells.map((shell, index) => (
        <div key={shell.id} className="shell-card">
          <div className="shell-card-header">
            <input className="settings-input" value={shell.name} placeholder="Name"
              onChange={(e) => updateShell(index, 'name', e.target.value)} />
            <button className="shell-remove" onClick={() => removeShell(index)} title="Remove">&#10005;</button>
          </div>
          <SettingRow label="Path" description="Executable path">
            <input className="settings-input" value={shell.path} placeholder="e.g. pwsh.exe"
              onChange={(e) => updateShell(index, 'path', e.target.value)} />
          </SettingRow>
          <SettingRow label="Arguments" description="Space-separated args">
            <input className="settings-input" value={shell.args.join(' ')} placeholder="e.g. -NoLogo"
              onChange={(e) => {
                const newShells = [...config.shells];
                newShells[index] = { ...newShells[index], args: e.target.value ? e.target.value.split(' ') : [] };
                update({ shells: newShells });
              }} />
          </SettingRow>
          <SettingRow label="Start Folder" description="Default working directory">
            <input className="settings-input" value={shell.cwd || ''} placeholder="e.g. C:\Projects"
              onChange={(e) => updateShell(index, 'cwd', e.target.value)} />
          </SettingRow>
        </div>
      ))}
      <button className="settings-add-btn" onClick={addShell}>+ Add Shell</button>
    </div>
  );
};

// ── Theme Settings ────────────────────────────────────────────────

const ThemeSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);

  const updateTheme = (field: string, value: string) => {
    update({ theme: { ...config.theme, [field]: value } });
  };

  const colors = [
    { key: 'background', label: 'Background' },
    { key: 'foreground', label: 'Foreground' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'selectionBackground', label: 'Selection' },
    { key: 'black', label: 'Black' },
    { key: 'red', label: 'Red' },
    { key: 'green', label: 'Green' },
    { key: 'yellow', label: 'Yellow' },
    { key: 'blue', label: 'Blue' },
    { key: 'magenta', label: 'Magenta' },
    { key: 'cyan', label: 'Cyan' },
    { key: 'white', label: 'White' },
  ];

  return (
    <div className="settings-section">
      <div className="theme-grid">
        {colors.map(({ key, label }) => (
          <div key={key} className="theme-color-row">
            <label className="theme-color-label">{label}</label>
            <div className="theme-color-input-group">
              <input type="color" className="theme-color-picker"
                value={config.theme[key] || '#000000'}
                onChange={(e) => updateTheme(key, e.target.value)} />
              <input type="text" className="settings-input small"
                value={config.theme[key] || ''}
                onChange={(e) => updateTheme(key, e.target.value)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Shared Components ─────────────────────────────────────────────

const SettingRow: React.FC<{ label: string; description?: string; children: React.ReactNode }> = ({ label, description, children }) => (
  <div className="setting-row">
    <div className="setting-info">
      <div className="setting-label">{label}</div>
      {description && <div className="setting-desc">{description}</div>}
    </div>
    {children}
  </div>
);

export default Settings;
