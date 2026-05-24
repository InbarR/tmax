import React, { useState, useCallback, useEffect } from 'react';
import { useTerminalStore } from '../state/terminal-store';
import { isMac, formatKeyForPlatform } from '../utils/platform';
import { THEME_PRESETS, themesEqual, type ThemePreset } from '../utils/theme-presets';

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

  const TAB_LABELS: Record<Tab, string> = {
    terminal: 'Terminal',
    shells: 'Shells',
    keybindings: 'Keybindings',
    theme: 'Theme',
    appearance: 'Appearance',
  };

  return (
    <div className="settings-backdrop" onMouseDown={close}>
      <div className="settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="shortcuts-close" onClick={close} title="Close (Esc)">&#10005;</button>
        </div>
        <div className="settings-layout">
          <nav className="settings-sidebar">
            {(['terminal', 'shells', 'keybindings', 'theme', 'appearance'] as Tab[]).map((t) => (
              <button key={t} className={`settings-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          <div className="settings-body">
            {tab === 'terminal' && <TerminalSettings />}
            {tab === 'keybindings' && <KeybindingsSettings />}
            {tab === 'shells' && <ShellsSettings />}
            {tab === 'theme' && <ThemeSettings />}
            {tab === 'appearance' && <AppearanceSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Section grouping ──────────────────────────────────────────────

const SectionGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="settings-group">
    <div className="settings-group-header">{title}</div>
    <div className="settings-group-body">{children}</div>
  </div>
);

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

function eventToAccelerator(e: KeyboardEvent): string | null {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'Hyper', 'Super'].includes(k)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key: string | null = null;
  if (k === ' ') key = 'Space';
  else if (k === 'Enter') key = 'Return';
  else if (k === 'ArrowUp') key = 'Up';
  else if (k === 'ArrowDown') key = 'Down';
  else if (k === 'ArrowLeft') key = 'Left';
  else if (k === 'ArrowRight') key = 'Right';
  else if (k === '+') key = 'Plus';
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) key = k;
  else if (/^[a-zA-Z]$/.test(k)) key = k.toUpperCase();
  else if (k.length === 1) key = k;
  else if (['Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(k)) key = k;

  if (!key) return null;
  parts.push(key);
  return parts.join('+');
}

function displayAccelerator(s: string): string {
  if (!s) return 'Disabled';
  const parts = s.split('+').map((p) => {
    if (p === 'CommandOrControl' || p === 'CmdOrCtrl') return isMac ? '⌘' : 'Ctrl';
    if (p === 'Command' || p === 'Cmd' || p === 'Meta' || p === 'Super') return isMac ? '⌘' : 'Win';
    if (p === 'Control' || p === 'Ctrl') return 'Ctrl';
    if (p === 'Alt' || p === 'Option') return isMac ? '⌥' : 'Alt';
    if (p === 'Shift') return isMac ? '⇧' : 'Shift';
    if (p === 'Return') return 'Enter';
    return p;
  });
  return parts.join(isMac ? '' : '+');
}

const HotkeyCapture: React.FC<{
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}> = ({ value, defaultValue, onChange }) => {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setRecording(false); return; }
      const accel = eventToAccelerator(e);
      if (accel) {
        onChange(accel);
        setRecording(false);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [recording, onChange]);

  return (
    <div className="hotkey-capture">
      <button
        type="button"
        className={`keybinding-key${recording ? ' recording' : ''}`}
        onClick={() => setRecording(true)}>
        {recording ? 'Press keys... (Esc to cancel)' : displayAccelerator(value)}
      </button>
      {!recording && value && (
        <button type="button" className="hotkey-capture-action" title="Disable" onClick={() => onChange('')}>
          ×
        </button>
      )}
      {!recording && value !== defaultValue && (
        <button type="button" className="hotkey-capture-action" title="Reset to default" onClick={() => onChange(defaultValue)}>
          ↺
        </button>
      )}
    </div>
  );
};

const TerminalSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);

  return (
    <div className="settings-section">
      <SectionGroup title="Defaults">
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
      </SectionGroup>

      <SectionGroup title="AI sessions">
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
        <SettingRow label="Notifications" description="Show OS notifications when a Copilot or Claude Code session finishes a turn / needs your attention. Disable if you use an external hook plugin (e.g. claude-notifications-go).">
          <label className="toggle-switch">
            <input type="checkbox"
              checked={(config as any).aiSessionNotifications !== false}
              onChange={(e) => update({ aiSessionNotifications: e.target.checked } as any)} />
            <span className="toggle-track" />
          </label>
        </SettingRow>
        <SettingRow label="Excluded phrases" description="Notifications whose title or body contains any of these (case-insensitive) are suppressed silently. Wrap a line in /slashes/ to use a regex (case-insensitive). Useful for filtering out background-automation toasts. (one phrase per line - press Enter between entries)">
          <textarea className="settings-input notification-exclude-textarea" rows={4}
            placeholder={'scheduled automation\nbackground task'}
            value={((config as any).notificationExcludeStrings ?? []).join('\n')}
            onChange={(e) => update({ notificationExcludeStrings: e.target.value.split('\n') } as any)} />
        </SettingRow>
        <SettingRow label="Shimmer indicator" description="Subtly pulse the border of any pane whose AI session is waiting for your input, unless that pane is the one you're currently in. Useful as a peripheral cue when you're on another pane or another window.">
          <label className="toggle-switch">
            <input type="checkbox"
              checked={(config as any).aiShimmerEnabled !== false}
              onChange={(e) => update({ aiShimmerEnabled: e.target.checked } as any)} />
            <span className="toggle-track" />
          </label>
        </SettingRow>
        <SettingRow label="Session load limit" description="Cap on recent sessions loaded per provider (Copilot and Claude Code each). Lower it for faster boot or less memory; set 0 to disable session loading entirely.">
          <input type="number" className="settings-input small" min={0} step={1}
            value={(config as any).aiSessionLoadLimit ?? 314}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              const clamped = Number.isFinite(n) && n >= 0 ? n : 0;
              update({ aiSessionLoadLimit: clamped } as any);
            }} />
        </SettingRow>
        <SettingRow label="Old session threshold" description="Days of inactivity before a session is marked as Old">
          <input type="number" className="settings-input small" value={(config as any).oldSessionDays ?? 30}
            onChange={(e) => update({ oldSessionDays: parseInt(e.target.value) || 30 } as any)} />
        </SettingRow>
      </SectionGroup>

      <SectionGroup title="System">
        <SettingRow label="Show-window hotkey" description="Global shortcut that restores and focuses tmax from anywhere. Takes effect on next launch.">
          <HotkeyCapture
            value={(config as any).showWindowHotkey ?? 'CommandOrControl+Shift+Space'}
            defaultValue="CommandOrControl+Shift+Space"
            onChange={(v) => update({ showWindowHotkey: v } as any)} />
        </SettingRow>
      </SectionGroup>
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

// Local-state input that commits to the store on blur / Enter. Keeps
// every keystroke local so the path/args/cwd fields don't churn the
// config (which previously round-tripped through the main process and
// could reject intermediate values, making the inputs feel frozen).
const ShellField: React.FC<{
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}> = ({ value, placeholder, onCommit }) => {
  const [draft, setDraft] = useState(value);
  // Sync down when the upstream value changes (e.g. another shell removed).
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      className="settings-input"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
};

const ShellsSettings: React.FC = () => {
  const config = useTerminalStore((s) => s.config)!;
  const update = useTerminalStore((s) => s.updateConfig);

  const commitShell = (index: number, patch: Partial<typeof config.shells[number]>) => {
    const newShells = [...config.shells];
    newShells[index] = { ...newShells[index], ...patch };
    update({ shells: newShells });
  };

  const addShell = () => {
    update({
      shells: [...config.shells, { id: `shell-${Date.now()}`, name: 'New Shell', path: '', args: [] }],
    });
  };

  const removeShell = (index: number) => {
    const shellToRemove = config.shells[index];
    if (shellToRemove.id === config.defaultShellId) return; // Guarded by disabled button; defensive.
    const newShells = config.shells.filter((_, i) => i !== index);
    update({ shells: newShells });
  };

  const setDefault = (id: string) => update({ defaultShellId: id });

  return (
    <div className="settings-section">
      {config.shells.map((shell, index) => {
        const isDefault = shell.id === config.defaultShellId;
        return (
          <div key={shell.id} className={`shell-card${isDefault ? ' shell-card-default' : ''}`}>
            <div className="shell-card-header">
              <ShellField value={shell.name} placeholder="Name"
                onCommit={(v) => commitShell(index, { name: v })} />
              {isDefault ? (
                <span className="shell-default-badge" title="New terminals open with this shell">★ Default</span>
              ) : (
                <button className="shell-set-default" onClick={() => setDefault(shell.id)}
                  title="Make this the default shell for new terminals">Set default</button>
              )}
              <button className="shell-remove"
                onClick={() => removeShell(index)}
                disabled={isDefault}
                title={isDefault ? 'Pick another default before removing' : 'Remove'}>&#10005;</button>
            </div>
            <SettingRow label="Path" description="Executable path">
              <ShellField value={shell.path} placeholder="e.g. pwsh.exe"
                onCommit={(v) => commitShell(index, { path: v })} />
            </SettingRow>
            <SettingRow label="Arguments" description="Space-separated args">
              <ShellField value={shell.args.join(' ')} placeholder="e.g. -NoLogo"
                onCommit={(v) => commitShell(index, { args: v ? v.split(' ') : [] })} />
            </SettingRow>
            <SettingRow label="Start Folder" description="Default working directory">
              <ShellField value={shell.cwd || ''} placeholder="e.g. C:\Projects"
                onCommit={(v) => commitShell(index, { cwd: v })} />
            </SettingRow>
          </div>
        );
      })}
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

  const applyPreset = (preset: ThemePreset) => {
    update({ theme: { ...config.theme, ...preset.theme } });
    // Chrome is applied via runtime CSS variable overrides; no config persist.
    for (const [key, value] of Object.entries(preset.chrome)) {
      document.documentElement.style.setProperty(key, value);
    }
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
      <SectionGroup title="Preset">
      <SettingRow label="Palette" description="Pick a built-in palette - selecting one sets every color below at once.">
        <div className="theme-preset-control">
          {(() => {
            const activePreset = THEME_PRESETS.find((p) =>
              themesEqual(config.theme as unknown as Record<string, string>, p.theme),
            );
            return (
              <span className="theme-preset-swatches" aria-hidden="true" title={activePreset?.name ?? 'Custom'}>
                <span style={{ background: (activePreset ?? THEME_PRESETS[0]).theme.background }} />
                <span style={{ background: (activePreset ?? THEME_PRESETS[0]).theme.foreground }} />
                <span style={{ background: (activePreset ?? THEME_PRESETS[0]).theme.red }} />
                <span style={{ background: (activePreset ?? THEME_PRESETS[0]).theme.green }} />
                <span style={{ background: (activePreset ?? THEME_PRESETS[0]).theme.cyan }} />
              </span>
            );
          })()}
          <select
            className="settings-input"
            value={
              THEME_PRESETS.find((p) =>
                themesEqual(config.theme as unknown as Record<string, string>, p.theme),
              )?.name ?? '__custom__'
            }
            onChange={(e) => {
              const preset = THEME_PRESETS.find((p) => p.name === e.target.value);
              if (preset) applyPreset(preset);
            }}
          >
            {!THEME_PRESETS.some((p) =>
              themesEqual(config.theme as unknown as Record<string, string>, p.theme),
            ) && (
              <option value="__custom__" disabled>Custom (hand-edited)</option>
            )}
            <optgroup label="Dark">
              {THEME_PRESETS.filter((p) => p.mode === 'dark').map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </optgroup>
            <optgroup label="Light">
              {THEME_PRESETS.filter((p) => p.mode === 'light').map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </SettingRow>
      </SectionGroup>
      <SectionGroup title="Colors">
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
      </SectionGroup>
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
      <SectionGroup title="Font">
      <SettingRow label="Size" description="Terminal font size in pixels">
        <input type="number" className="settings-input small" value={config.terminal.fontSize}
          onChange={(e) => update({ terminal: { ...config.terminal, fontSize: parseInt(e.target.value) || 14 } })} />
      </SettingRow>
      <SettingRow label="Face" description="Type a font name or pick from the list">
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
      </SectionGroup>

      <SectionGroup title="Tabs">
        <SettingRow label="Tab mode" description="Flat: one terminal per tab. Workspaces: each tab is a collection of panes with its own grid.">
          <select className="settings-input" value={config.tabMode || 'flat'}
            onChange={(e) => update({ tabMode: e.target.value as 'flat' | 'workspaces' })}>
            <option value="flat">Flat</option>
            <option value="workspaces">Workspaces</option>
          </select>
        </SettingRow>
        <SettingRow label="Hide tab close buttons" description="Hide the ✕ button on tabs to avoid accidentally closing them">
          <label className="toggle-switch">
            <input type="checkbox" checked={(config as any).hideTabCloseButtons === true}
              onChange={() => useTerminalStore.getState().toggleHideTabCloseButtons()} />
            <span className="toggle-track" />
          </label>
        </SettingRow>
        <SettingRow label="Default tab color" description="Background tint for all terminals without a custom color">
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
        {/* TASK-170: single knob that drives the tint strength for every
            pane tint (per-pane, per-workspace, per-group, default). 40 is
            the original behavior so existing setups don't regress. 100
            pushes neutrals (black/white/gray) to fully solid panes;
            vivid colors cap their body fill by chroma so terminal text
            stays readable. */}
        <SettingRow label="Tab color intensity" description={`Strength of every tab tint (per-pane, per-workspace, per-group, default): ${(config as any).tabColorIntensity ?? 40}`}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
            <input
              type="range"
              min="0"
              max="100"
              value={(config as any).tabColorIntensity ?? 40}
              onChange={(e) => update({ tabColorIntensity: parseInt(e.target.value, 10) } as any)}
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {(config as any).tabColorIntensity ?? 40}
            </span>
            <button className="settings-reset-btn" onClick={() => update({ tabColorIntensity: 40 } as any)}>
              Reset
            </button>
          </div>
        </SettingRow>
      </SectionGroup>

      {platformSupported !== false && (
        <SectionGroup title="Window">
          <SettingRow label="Background material" description="Window backdrop material (Windows 11)">
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
            <SettingRow label="Background opacity" description={`UI chrome opacity: ${Math.round(currentOpacity * 100)}%`}>
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
        </SectionGroup>
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
