import React, { useState, useCallback, useEffect } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { isMac, formatKeyForPlatform } from '../utils/platform';

type Tab = 'terminal' | 'keybindings' | 'shells' | 'theme' | 'appearance';

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
        useTerminalStore.getState().closeSettings();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [show]);

  if (!show || !config) return null;

  const close = () => useTerminalStore.getState().closeSettings();

  return (
    <div className="settings-backdrop" onMouseDown={close}>
      <div className="settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="shortcuts-close" onClick={close}>&#10005;</button>
        </div>
        <div className="settings-tabs">
          {(['terminal', 'keybindings', 'shells', 'theme', 'appearance'] as Tab[]).map((t) => (
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
          {tab === 'appearance' && <AppearanceSettings />}
        </div>
      </div>
    </div>
  );
};

// ── Terminal Settings ──────────────────────────────────────────────

const FALLBACK_FONTS = [
  'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Courier New', 'Lucida Console',
];

function useAvailableFonts(): string[] {
  const [available, setAvailable] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      // Get all system fonts from the main process
      let allFonts: string[];
      try {
        allFonts = await (window.terminalAPI as any).getSystemFonts();
      } catch {
        allFonts = [];
      }
      if (!allFonts || allFonts.length === 0) {
        setAvailable(FALLBACK_FONTS);
        return;
      }

      // Filter to monospace fonts using canvas measurement:
      // A monospace font renders 'i' and 'W' at the same width.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { setAvailable(FALLBACK_FONTS); return; }

      const mono: string[] = [];
      for (const font of allFonts) {
        ctx.font = `16px "${font}"`;
        const wi = ctx.measureText('iiiiii').width;
        const wW = ctx.measureText('WWWWWW').width;
        if (Math.abs(wi - wW) < 0.5) {
          mono.push(font);
        }
      }
      setAvailable(mono.length > 0 ? mono : FALLBACK_FONTS);
    })();
  }, []);
  return available;
}

const TerminalSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);

  return (
    <div className="settings-section">
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
      <SettingRow label="Copilot Command" description="Base command for Copilot sessions">
        <input type="text" className="settings-input" value={config.copilotCommand ?? ''}
          placeholder="copilot"
          onChange={(e) => update({ copilotCommand: e.target.value } as any)} />
      </SettingRow>
      <SettingRow label="Claude Code Command" description="Base command for Claude Code sessions (e.g., claude)">
        <input type="text" className="settings-input" value={config.claudeCodeCommand || 'claude'}
          placeholder="claude"
          onChange={(e) => update({ claudeCodeCommand: e.target.value } as any)} />
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
      // On Mac, record Cmd (metaKey) as Ctrl for cross-platform storage consistency
      if (isMac ? e.metaKey : e.ctrlKey) parts.push('Ctrl');
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
            {recording === binding.originalIndex ? 'Press keys...' : formatKeyForPlatform(binding.key)}
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

// ── Appearance Settings ───────────────────────────────────────────

const MATERIAL_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Opaque background (default)' },
  { value: 'mica', label: 'Mica', description: 'Subtle desktop-tinted material' },
  { value: 'acrylic', label: 'Acrylic', description: 'Frosted glass blur effect' },
  { value: 'tabbed', label: 'Tabbed', description: 'Tabbed title bar style' },
  { value: 'auto', label: 'Auto', description: 'System decides the material' },
];

const AppearanceSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);
  const availableFonts = useAvailableFonts();
  const [fontInputValue, setFontInputValue] = useState(
    config.terminal.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  );
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [fontTyping, setFontTyping] = useState(false);
  const fontInputRef = React.useRef<HTMLInputElement>(null);
  const fontDropdownRef = React.useRef<HTMLDivElement>(null);
  const [platformSupported, setPlatformSupported] = useState<boolean | null>(null);

  useEffect(() => {
    window.terminalAPI.getPlatformSupportsMaterial().then(setPlatformSupported);
  }, []);

  const applyFont = (fontName: string) => {
    setFontInputValue(fontName);
    setFontDropdownOpen(false);
    setFontTyping(false);
    update({ terminal: { ...config.terminal, fontFamily: `${fontName}, monospace` } });
  };

  const applyDefaultColor = (color: string) => {
    update({ defaultTabColor: color } as any);
  };

  // Close font dropdown on outside click
  useEffect(() => {
    if (!fontDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node) &&
          fontInputRef.current && !fontInputRef.current.contains(e.target as Node)) {
        setFontDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fontDropdownOpen]);

  const currentMaterial = (config as any).backgroundMaterial || 'none';
  const currentOpacity = (config as any).backgroundOpacity ?? 0.8;

  return (
    <div className="settings-section">
      <SettingRow label="Font Size" description="Terminal font size in pixels">
        <input type="number" className="settings-input small" value={config.terminal.fontSize}
          onChange={(e) => update({ terminal: { ...config.terminal, fontSize: parseInt(e.target.value) || 14 } })} />
      </SettingRow>
      <SettingRow label="Font Face" description="Type a font name or pick from the list">
        <div className="font-combobox">
          <input
            ref={fontInputRef}
            className="settings-input font-combobox-input"
            type="text"
            value={fontInputValue}
            onChange={(e) => {
              setFontInputValue(e.target.value);
              setFontTyping(true);
              setFontDropdownOpen(true);
            }}
            onFocus={() => setFontDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFontDropdownOpen(false);
                setFontTyping(false);
              }
              if (e.key === 'Enter') {
                const trimmed = fontInputValue.trim();
                if (trimmed) applyFont(trimmed);
              }
            }}
            onBlur={() => {
              // delay to allow dropdown click to register
              setTimeout(() => {
                if (!fontDropdownRef.current?.contains(document.activeElement)) {
                  setFontDropdownOpen(false);
                  setFontTyping(false);
                }
              }, 150);
            }}
          />
          <span
            className="font-combobox-arrow"
            onMouseDown={(e) => {
              e.preventDefault();
              setFontDropdownOpen((v) => !v);
              setFontTyping(false);
            }}
          >&#9662;</span>
          {fontDropdownOpen && (() => {
            const filtered = fontTyping && fontInputValue.trim()
              ? availableFonts.filter((f) => f.toLowerCase().includes(fontInputValue.trim().toLowerCase()))
              : availableFonts;
            const inputRect = fontInputRef.current?.getBoundingClientRect();
            const dropdownStyle = inputRect ? {
              top: inputRect.bottom + 2,
              left: inputRect.left,
              width: Math.max(inputRect.width, 220),
            } : {};
            return filtered.length > 0 ? (
              <div ref={fontDropdownRef} className="font-dropdown" style={dropdownStyle}>
                {filtered.map((f) => (
                  <div
                    key={f}
                    className="font-dropdown-item"
                    style={{ fontFamily: `"${f}", monospace` }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyFont(f);
                    }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            ) : null;
          })()}
        </div>
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
      {platformSupported !== false && (
        <>
          <SettingRow label="Background Material" description="Window backdrop material (Windows 11)">
            <select
              className="settings-input"
              value={currentMaterial}
              onChange={(e) => update({ backgroundMaterial: e.target.value } as any)}
            >
              {MATERIAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </SettingRow>
          {currentMaterial !== 'none' && (
            <SettingRow label="Background Opacity" description={`UI chrome opacity: ${Math.round(currentOpacity * 100)}%`}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(currentOpacity * 100)}
                  onChange={(e) => update({ backgroundOpacity: parseInt(e.target.value) / 100 } as any)}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(currentOpacity * 100)}%
                </span>
              </div>
            </SettingRow>
          )}
        </>
      )}
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
