import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTerminalStore } from '../state/terminal-store';
import { confirmDialog } from './AppDialog';
import type { BacklogTask } from '../../shared/backlog-types';
import '../styles/backlog-board.css';

type Project = { name: string; path: string; color?: string };

// Canonical column order; any other status found in tasks is appended.
const BASE_COLUMNS = ['To Do', 'In Progress', 'Done'];

// Stable per-project identity color, hashed into a curated palette. Deliberately
// excludes status-signal red and green so a swatch never reads as offline/online.
const SWATCH_COLORS = [
  '#89b4fa', // blue
  '#94e2d5', // teal
  '#cba6f7', // mauve
  '#fab387', // peach
  '#74c7ec', // sapphire
  '#b4befe', // lavender
  '#f5c2e7', // pink
  '#f9e2af', // yellow
  '#89dceb', // sky
  '#cdd6f4', // text
];
function projectColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SWATCH_COLORS[h % SWATCH_COLORS.length];
}

// Accent color per kanban column status (dynamic statuses get the generic accent).
function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'done') return 'var(--accent-success)';
  if (s === 'in progress') return 'var(--accent-warning)';
  if (s === 'to do') return 'var(--text-secondary)';
  return 'var(--accent)';
}

// Pull the Description section text out of a task body.
function extractDescription(body: string): string {
  const m = body.match(/<!--\s*SECTION:DESCRIPTION:BEGIN\s*-->\r?\n([\s\S]*?)\r?\n<!--\s*SECTION:DESCRIPTION:END\s*-->/);
  if (m) return m[1].trim();
  const h = body.match(/(^|\n)##\s*Description\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return h ? h[2].trim() : '';
}

function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

const api = () => (window as any).terminalAPI as {
  backlogListTasks: (p: Project[]) => Promise<BacklogTask[]>;
  backlogGetTask: (path: string, sub: string, file: string) => Promise<{ frontmatter: Record<string, unknown>; body: string } | null>;
  backlogEditTask: (p: { projectPath: string; taskId: string; status?: string; title?: string; description?: string; checkAc?: number[]; uncheckAc?: number[] }) => Promise<{ ok: boolean; error?: string }>;
  backlogCreateTask: (p: { projectPath: string; title: string; status?: string; description?: string; labels?: string[] }) => Promise<{ ok: boolean; id?: string; error?: string }>;
  backlogArchiveTask: (path: string, taskId: string) => Promise<{ ok: boolean; error?: string }>;
  backlogValidateProject: (path: string) => Promise<{ ok: boolean }>;
  backlogInitProject: (path: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  backlogPickFolder: (defaultPath?: string) => Promise<string | null>;
  backlogSaveImage: (projectPath: string) => Promise<{ ok: boolean; relPath?: string; error?: string }>;
  fileReveal: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  clipboardWrite: (text: string) => void;
  clipboardHasImage: () => boolean;
  imageReadAsDataUrl: (filePath: string) => Promise<string | null>;
};

function taskFilePath(t: BacklogTask): string {
  // fileReveal accepts forward or back slashes; build a forward-slash path.
  return `${t.project.path.replace(/\\/g, '/')}/backlog/${t.sub}/${t.file}`;
}

const BacklogBoard: React.FC = () => {
  const show = useTerminalStore((s) => s.showBacklog);
  const config = useTerminalStore((s) => s.config);
  const updateConfig = useTerminalStore((s) => s.updateConfig);

  const projects: Project[] = useMemo(
    () => (config?.backlogProjects as Project[] | undefined) ?? [],
    [config?.backlogProjects],
  );

  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(null); // project.path or null = all
  const [selected, setSelected] = useState<BacklogTask | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; task: BacklogTask } | null>(null);

  const displayMode: 'overlay' | 'panel' =
    (config?.backlogDisplayMode as 'overlay' | 'panel' | undefined) ?? 'panel';
  const panelSide: 'left' | 'right' =
    (config?.backlogPanelSide as 'left' | 'right' | undefined) ?? 'left';
  const [panelWidth, setPanelWidth] = useState<number>(config?.backlogPanelWidth ?? 640);
  const [sidebarWidth, setSidebarWidth] = useState<number>(220);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    if (!projects.length) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const list = await api().backlogListTasks(projects);
      setTasks(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, [projects]);

  // Refresh on open, and whenever the window regains focus while open.
  useEffect(() => {
    if (!show) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [show, refresh]);

  // On open, focus the project matching the active pane's cwd (if it's one of
  // the configured projects), so opening the board from a repo lands on it.
  useEffect(() => {
    if (!show) return;
    const st = useTerminalStore.getState();
    const focused =
      (st.focusedTerminalId && st.terminals.get(st.focusedTerminalId)) ||
      [...st.terminals.values()][0];
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const cwd = norm(focused?.cwd || '');
    if (!cwd) return;
    const match = projects.find((p) => {
      const pp = norm(p.path);
      return cwd === pp || cwd.startsWith(pp + '/');
    });
    if (match) setProjectFilter(match.path);
    // Only run when the board opens (not on every projects change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Esc closes the detail modal, then the board. When a card context menu is
  // open, defer to its own Esc handler so dismissing the menu doesn't also
  // close the whole board.
  useEffect(() => {
    if (!show) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu) return; // the context menu handles its own Escape
        e.stopPropagation();
        if (selected) setSelected(null);
        else useTerminalStore.getState().closeBacklog();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [show, selected, menu]);

  if (!show) return null;

  const close = () => useTerminalStore.getState().closeBacklog();

  const visible = tasks.filter((t) => {
    if (projectFilter && t.project.path !== projectFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.labels.some((l) => l.toLowerCase().includes(q)) ||
      t.assignee.some((a) => a.toLowerCase().includes(q)) ||
      t.project.name.toLowerCase().includes(q)
    );
  });

  // Columns = base order + any extra statuses present, in first-seen order.
  const statuses: string[] = [...BASE_COLUMNS];
  for (const t of visible) if (!statuses.includes(t.status)) statuses.push(t.status);

  const byStatus = (status: string) =>
    visible
      .filter((t) => t.status === status)
      .sort((a, b) => b.mtime - a.mtime);

  // ── Project management ────────────────────────────────────────────
  const saveProjects = (next: Project[]) => updateConfig({ backlogProjects: next });
  // Resolve a project's identity color: explicit custom color, else hashed.
  // Plain function (not a hook) - it's defined after the `if (!show)` early
  // return, so it must not call useCallback.
  const colorFor = (ref: { name: string; path: string }) => {
    const p = projects.find((x) => x.path === ref.path);
    return p?.color || projectColor(ref.name);
  };
  const setProjectColor = (p: Project, color: string | undefined) =>
    saveProjects(projects.map((x) => (x.path === p.path ? { ...x, color } : x)));
  const setProjectName = (p: Project, name: string) =>
    saveProjects(projects.map((x) => (x.path === p.path ? { ...x, name } : x)));
  const removeProject = async (p: Project) => {
    const ok = await confirmDialog({
      title: 'Remove project?',
      message: `Remove "${p.name}" from the Backlog board?\nThis only removes it from this list - the project's files are not touched.`,
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    if (projectFilter === p.path) setProjectFilter(null);
    saveProjects(projects.filter((x) => x.path !== p.path));
  };
  const moveProject = (idx: number, dir: -1 | 1) => {
    const next = [...projects];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    saveProjects(next);
  };

  // ── Status change (shared by drag + context menu) ─────────────────
  const changeStatus = async (task: BacklogTask, status: string) => {
    if (task.status === status) return;
    setTasks((prev) =>
      prev.map((t) => (t === task ? { ...t, status, mtime: Date.now() } : t)),
    );
    const r = await api().backlogEditTask({
      projectPath: task.project.path,
      taskId: task.id,
      status,
    });
    if (!r.ok) {
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'edit failed'}`);
    }
    void refresh();
  };

  const onDropTo = (status: string) => {
    const task = tasks.find((t) => `${t.project.path}::${t.id}` === dragId);
    setDragId(null);
    if (task) void changeStatus(task, status);
  };

  const archiveTask = async (task: BacklogTask) => {
    const r = await api().backlogArchiveTask(task.project.path, task.id);
    if (!r.ok) useTerminalStore.getState().addToast(`Backlog: ${r.error || 'archive failed'}`);
    if (selected === task) setSelected(null);
    void refresh();
  };

  // Bulk-archive every (visible) task in a column.
  const archiveAllInColumn = async (status: string) => {
    const inCol = byStatus(status);
    if (!inCol.length) return;
    const ok = await confirmDialog({
      title: 'Archive all?',
      message: `Archive all ${inCol.length} "${status}" task${inCol.length === 1 ? '' : 's'}? They move to backlog/archive.`,
      confirmText: 'Archive all',
      danger: true,
    });
    if (!ok) return;
    for (const t of inCol) await api().backlogArchiveTask(t.project.path, t.id);
    void refresh();
  };

  // Create a task with an optimistic placeholder card so it appears instantly,
  // since the backlog CLI write + re-scan takes a second or two.
  const createTaskOptimistic = async (projectPath: string, status: string, title: string) => {
    const proj = projects.find((p) => p.path === projectPath);
    const tempId = `__pending-${title}-${status}`;
    const placeholder: BacklogTask = {
      id: '…',
      title,
      status,
      assignee: [],
      labels: [],
      file: tempId,
      sub: 'tasks',
      project: { name: proj?.name ?? projectPath, path: projectPath },
      mtime: Number.MAX_SAFE_INTEGER, // sort to top of the column
      pending: true,
    } as BacklogTask & { pending?: boolean };
    setTasks((prev) => [...prev, placeholder]);
    const r = await api().backlogCreateTask({ projectPath, title, status });
    if (!r.ok) {
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'create failed'}`);
      setTasks((prev) => prev.filter((t) => t.file !== tempId)); // drop placeholder on failure
      return;
    }
    // Re-scan, then open the new task's detail so the user can add a
    // description / acceptance criteria right after creating it.
    const list = await api().backlogListTasks(projects);
    setTasks(Array.isArray(list) ? list : []);
    const created = r.id ? list.find((t) => t.id === r.id && t.project.path === projectPath) : undefined;
    if (created) setSelected(created);
  };

  const setMode = (m: 'overlay' | 'panel') => updateConfig({ backlogDisplayMode: m });
  const toggleSide = () =>
    updateConfig({ backlogPanelSide: panelSide === 'right' ? 'left' : 'right' });

  const inner = (
    <>
      <div className="backlog-header">
        <span className="backlog-title">Backlog</span>
        <input
          className="backlog-search"
          placeholder="Search title, id, label, assignee, project..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="backlog-refresh" onClick={() => void refresh()} title="Refresh">
          {loading ? '...' : '↻'}
        </button>
        {displayMode === 'panel' && (
          <button
            className="backlog-refresh"
            onClick={toggleSide}
            title={panelSide === 'right' ? 'Move panel to the left' : 'Move panel to the right'}
          >
            {panelSide === 'right' ? '⇤' : '⇥'}
          </button>
        )}
        <button
          className="backlog-refresh"
          onClick={() => setMode(displayMode === 'panel' ? 'overlay' : 'panel')}
          title={displayMode === 'panel' ? 'Expand to full window' : 'Dock as side panel'}
        >
          {displayMode === 'panel' ? '⤢' : '⇥'}
        </button>
        <button className="shortcuts-close" onClick={close} title="Close (Esc)">
          &#10005;
        </button>
      </div>

      <div className="backlog-layout">
        <div
          className={`backlog-sidebar-wrap${sidebarCollapsed ? ' collapsed' : ''}`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <ProjectSidebar
            projects={projects}
            tasks={tasks}
            filter={projectFilter}
            colorFor={colorFor}
            onFilter={setProjectFilter}
            onRemove={removeProject}
            onMove={moveProject}
            onSetColor={setProjectColor}
            onSetName={setProjectName}
            onAdd={(p) => saveProjects([...projects, p])}
          />
        </div>
        <SidebarSplitter
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          onResize={setSidebarWidth}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="backlog-board">
          {projects.length === 0 ? (
            <div className="backlog-empty">
              <p>No projects yet.</p>
              <p className="backlog-empty-hint">
                Add a folder that contains a <code>backlog/</code> directory from the
                projects sidebar.
              </p>
            </div>
          ) : (
            statuses.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={byStatus(status)}
                singleProject={projectFilter}
                colorFor={colorFor}
                onCardOpen={setSelected}
                onDragStart={setDragId}
                onDrop={() => onDropTo(status)}
                onCreate={createTaskOptimistic}
                onArchiveAll={() => void archiveAllInColumn(status)}
                onCardContext={(e, task) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, task });
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  );

  const overlays = (
    <>
      {selected && (
        <TaskDetail
          task={selected}
          colorFor={colorFor}
          onClose={() => setSelected(null)}
          onArchive={archiveTask}
          onChanged={() => void refresh()}
        />
      )}
      {menu && (
        <CardContextMenu
          x={menu.x}
          y={menu.y}
          task={menu.task}
          statuses={statuses}
          onClose={() => setMenu(null)}
          onOpen={(t) => { setSelected(t); setMenu(null); }}
          onStatus={(t, s) => { void changeStatus(t, s); setMenu(null); }}
          onArchive={(t) => { void archiveTask(t); setMenu(null); }}
        />
      )}
    </>
  );

  if (displayMode === 'panel') {
    return (
      <div className={`backlog-panel side-${panelSide}`} style={{ width: panelWidth }}>
        {inner}
        <PanelResizeHandle
          width={panelWidth}
          side={panelSide}
          onChange={setPanelWidth}
          onCommit={(w) => updateConfig({ backlogPanelWidth: w })}
        />
        {overlays}
      </div>
    );
  }

  return ReactDOM.createPortal(
    <div className="backlog-backdrop" onMouseDown={close}>
      <div className="backlog-window" onMouseDown={(e) => e.stopPropagation()}>
        {inner}
      </div>
      {overlays}
    </div>,
    document.body,
  );
};

// ── Resizable handle for the docked side panel ───────────────────────

const PanelResizeHandle: React.FC<{
  width: number;
  side: 'left' | 'right';
  onChange: (w: number) => void;
  onCommit: (w: number) => void;
}> = ({ width, side, onChange, onCommit }) => {
  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    // Handle sits on the panel's inner edge: right-docked panel grows when the
    // cursor moves left, left-docked panel grows when the cursor moves right.
    const sign = side === 'right' ? -1 : 1;
    let latest = width;
    const move = (ev: MouseEvent) => {
      latest = Math.max(360, Math.min(1200, startW + sign * (ev.clientX - startX)));
      onChange(latest);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      onCommit(latest);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return <div className="backlog-panel-resize" onMouseDown={start} title="Drag to resize" />;
};

// ── Resizable / collapsible splitter between the project sidebar and board ──

const SidebarSplitter: React.FC<{
  collapsed: boolean;
  width: number;
  onResize: (w: number) => void;
  onToggleCollapse: () => void;
}> = ({ collapsed, width, onResize, onToggleCollapse }) => {
  const start = (e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => {
      onResize(Math.max(140, Math.min(420, startW + (ev.clientX - startX))));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return (
    <div
      className={`backlog-sidebar-splitter${collapsed ? ' collapsed' : ''}`}
      onMouseDown={start}
      title={collapsed ? '' : 'Drag to resize'}
    >
      <button
        className="backlog-sidebar-collapse"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggleCollapse}
        title={collapsed ? 'Show projects' : 'Hide projects'}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </div>
  );
};

// ── Card context menu ────────────────────────────────────────────────

const CardContextMenu: React.FC<{
  x: number;
  y: number;
  task: BacklogTask;
  statuses: string[];
  onClose: () => void;
  onOpen: (t: BacklogTask) => void;
  onStatus: (t: BacklogTask, status: string) => void;
  onArchive: (t: BacklogTask) => void;
}> = ({ x, y, task, statuses, onClose, onOpen, onStatus, onArchive }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [showMove, setShowMove] = useState(false);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  // Clamp to viewport.
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 4;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - pad) nx = Math.max(pad, window.innerWidth - rect.width - pad);
    if (ny + rect.height > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - rect.height - pad);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  const copy = (text: string) => {
    try { api().clipboardWrite(text); } catch { /* ignore */ }
    onClose();
  };
  const reveal = () => {
    void api().fileReveal(taskFilePath(task));
    onClose();
  };

  return ReactDOM.createPortal(
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      <button className="context-menu-item" onClick={() => onOpen(task)}>Open details</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={() => setShowMove((v) => !v)}>
        Move to &#9656;
      </button>
      {showMove && (
        <div className="context-menu-sub">
          {statuses.map((s) => (
            <button
              key={s}
              className={`context-menu-item sub${s === task.status ? ' active-check' : ''}`}
              onClick={() => onStatus(task, s)}
            >
              {s} {s === task.status ? '✓' : ''}
            </button>
          ))}
        </div>
      )}
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={() => copy(task.id)}>Copy ID</button>
      <button className="context-menu-item" onClick={() => copy(task.title)}>Copy title</button>
      <button className="context-menu-item" onClick={reveal}>Reveal task file</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item danger" onClick={() => onArchive(task)}>Archive</button>
    </div>,
    document.body,
  );
};

// ── Project context menu ─────────────────────────────────────────────

const ProjectContextMenu: React.FC<{
  x: number;
  y: number;
  project: Project;
  idx: number;
  count: number;
  currentColor: string;
  onClose: () => void;
  onFilter: () => void;
  onRename: () => void;
  onMove: (dir: -1 | 1) => void;
  onSetColor: (color: string | undefined) => void;
  onReveal: () => void;
  onRemove: () => void;
}> = ({ x, y, project, idx, count, currentColor, onClose, onFilter, onRename, onMove, onSetColor, onReveal, onRemove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 4;
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - pad) nx = Math.max(pad, window.innerWidth - rect.width - pad);
    if (ny + rect.height > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - rect.height - pad);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  return ReactDOM.createPortal(
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      <button className="context-menu-item" onClick={onFilter}>Show only this project</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={onRename}>Rename</button>
      <button className="context-menu-item" onClick={() => setShowColors((v) => !v)}>Set color &#9656;</button>
      {showColors && (
        <div className="context-menu-sub backlog-color-grid">
          {SWATCH_COLORS.map((c) => (
            <button
              key={c}
              className={`backlog-color-swatch${c === currentColor ? ' active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => onSetColor(c)}
            />
          ))}
          <button className="backlog-color-swatch clear" title="Default (auto)" onClick={() => onSetColor(undefined)}>
            &#10005;
          </button>
        </div>
      )}
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={() => onMove(-1)} disabled={idx === 0}>Move up</button>
      <button className="context-menu-item" onClick={() => onMove(1)} disabled={idx === count - 1}>Move down</button>
      <button className="context-menu-item" onClick={onReveal}>Reveal in file manager</button>
      <div className="context-menu-separator" />
      <button className="context-menu-item danger" onClick={onRemove}>Remove from board</button>
    </div>,
    document.body,
  );
};

// ── Sidebar ──────────────────────────────────────────────────────────

const ProjectSidebar: React.FC<{
  projects: Project[];
  tasks: BacklogTask[];
  filter: string | null;
  colorFor: (ref: { name: string; path: string }) => string;
  onFilter: (path: string | null) => void;
  onRemove: (p: Project) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onSetColor: (p: Project, color: string | undefined) => void;
  onSetName: (p: Project, name: string) => void;
  onAdd: (p: Project) => void;
}> = ({ projects, tasks, filter, colorFor, onFilter, onRemove, onMove, onSetColor, onSetName, onAdd }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; project: Project; idx: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // project.path being renamed
  const [renameValue, setRenameValue] = useState('');

  const countFor = (p: Project) =>
    tasks.filter((t) => t.project.path === p.path && t.status !== 'Done').length;

  // Add a folder as a project. If it has no backlog/ folder, offer to
  // initialize one there. Returns true if a project was added.
  const addOrInit = async (folderPath: string, displayName: string): Promise<boolean> => {
    const valid = await api().backlogValidateProject(folderPath);
    if (valid?.ok) {
      onAdd({ name: displayName, path: folderPath });
      return true;
    }
    const ok = await confirmDialog({
      title: 'No Backlog project here',
      message: `"${folderPath}" doesn't contain a backlog/ folder.\nInitialize a new Backlog project here? (creates backlog/, and a git repo if the folder isn't one yet)`,
      confirmText: 'Initialize',
    });
    if (!ok) {
      setError('No backlog/ folder there');
      return false;
    }
    const res = await api().backlogInitProject(folderPath, displayName);
    if (!res.ok) {
      setError(`Init failed: ${res.error?.split('\n')[0] || 'unknown error'}`);
      return false;
    }
    onAdd({ name: displayName, path: folderPath });
    return true;
  };

  const submit = async () => {
    setError('');
    const trimmedPath = path.trim().replace(/[\\/]+$/, '');
    if (!trimmedPath) {
      setError('Enter a folder path');
      return;
    }
    if (projects.some((p) => p.path === trimmedPath)) {
      setError('Already added');
      return;
    }
    try {
      // If the backlog bridge isn't present, the app is running a stale
      // preload (e.g. a dev session started before this feature). Say so
      // instead of silently doing nothing.
      if (typeof api().backlogValidateProject !== 'function') {
        setError('Backlog bridge unavailable - restart tmax');
        return;
      }
      const derived =
        name.trim() || trimmedPath.split(/[\\/]/).filter(Boolean).pop() || trimmedPath;
      const added = await addOrInit(trimmedPath, derived);
      if (added) {
        setName('');
        setPath('');
        setAdding(false);
      }
    } catch (e) {
      const msg = (e as Error)?.message || 'unknown error';
      // A missing preload method or unregistered main handler both mean the
      // app is running stale code from before this feature - a full restart
      // (not a window reload) reloads the main process and the bridge.
      if (/No handler registered|is not a function/i.test(msg)) {
        setError('Backlog not loaded - fully quit and relaunch tmax');
      } else {
        setError(`Couldn't add: ${msg}`);
      }
    }
  };

  // Add the focused terminal pane's working directory as a project.
  const addCurrentDir = async () => {
    setError('');
    const st = useTerminalStore.getState();
    const focused = st.focusedTerminalId ? st.terminals.get(st.focusedTerminalId) : undefined;
    const cwd = (focused?.cwd || '').replace(/[\\/]+$/, '');
    if (!cwd) {
      setError('No focused pane directory');
      return;
    }
    if (projects.some((p) => p.path === cwd)) {
      setError('Already added');
      return;
    }
    try {
      const derived = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;
      const added = await addOrInit(cwd, derived);
      if (added) setAdding(false);
    } catch (e) {
      setError(`Couldn't add: ${(e as Error)?.message || 'unknown error'}`);
    }
  };

  return (
    <nav className="backlog-sidebar">
      <button
        className={`backlog-proj-all${filter === null ? ' active' : ''}`}
        onClick={() => onFilter(null)}
      >
        All projects
      </button>

      {projects.map((p, idx) => (
        <div
          key={p.path}
          className={`backlog-proj${filter === p.path ? ' active' : ''}`}
          onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, project: p, idx }); }}
        >
          {renaming === p.path ? (
            <input
              className="backlog-proj-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => { const v = renameValue.trim(); if (v) onSetName(p, v); setRenaming(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { const v = renameValue.trim(); if (v) onSetName(p, v); setRenaming(null); }
                if (e.key === 'Escape') setRenaming(null);
              }}
              autoFocus
            />
          ) : (
          <button className="backlog-proj-main" onClick={() => onFilter(p.path)} title={p.path}>
            <span className="backlog-proj-dot" style={{ background: colorFor(p) }} />
            <span className="backlog-proj-name">{p.name}</span>
            <span className="backlog-proj-count">{countFor(p)}</span>
          </button>
          )}
          <div className="backlog-proj-actions">
            <button onClick={() => onMove(idx, -1)} disabled={idx === 0} title="Move up">
              {'↑'}
            </button>
            <button
              onClick={() => onMove(idx, 1)}
              disabled={idx === projects.length - 1}
              title="Move down"
            >
              {'↓'}
            </button>
            <button onClick={() => onRemove(p)} title="Remove" className="backlog-proj-remove">
              {'✕'}
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="backlog-add-form">
          <div className="backlog-add-path-row">
            <input
              placeholder="Folder path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              autoFocus
            />
            <button
              className="backlog-browse-btn"
              title="Browse for folder"
              onClick={async () => {
                const st = useTerminalStore.getState();
                // Live cwd is tracked into terminal.cwd via OSC 7 / prompt. Use
                // the focused pane, else any pane, else fall back to a sibling
                // of an existing project so Browse opens near the user's repos
                // instead of Documents.
                const focused =
                  (st.focusedTerminalId && st.terminals.get(st.focusedTerminalId)) ||
                  [...st.terminals.values()][0];
                const projParent = projects.length
                  ? projects[projects.length - 1].path.replace(/[\\/][^\\/]+[\\/]?$/, '')
                  : '';
                const picked = await api().backlogPickFolder(focused?.cwd || projParent || undefined);
                if (picked) {
                  setPath(picked);
                  if (!name.trim()) setName(picked.split(/[\\/]/).filter(Boolean).pop() || '');
                }
              }}
            >
              Browse…
            </button>
          </div>
          <input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {error && <div className="backlog-add-error">{error}</div>}
          <div className="backlog-add-buttons">
            <button onClick={() => void submit()}>Add</button>
            <button onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <button className="backlog-add-btn" onClick={() => setAdding(true)}>
            + Add project
          </button>
          <button
            className="backlog-add-btn subtle"
            onClick={() => void addCurrentDir()}
            title="Add the focused pane's working directory"
          >
            + Add current directory
          </button>
          {error && <div className="backlog-add-error">{error}</div>}
        </>
      )}

      {menu && (
        <ProjectContextMenu
          x={menu.x}
          y={menu.y}
          project={menu.project}
          idx={menu.idx}
          count={projects.length}
          currentColor={colorFor(menu.project)}
          onClose={() => setMenu(null)}
          onFilter={() => { onFilter(menu.project.path); setMenu(null); }}
          onRename={() => { setRenameValue(menu.project.name); setRenaming(menu.project.path); setMenu(null); }}
          onMove={(dir) => { onMove(menu.idx, dir); setMenu(null); }}
          onSetColor={(c) => { onSetColor(menu.project, c); setMenu(null); }}
          onReveal={() => { void api().fileReveal(menu.project.path); setMenu(null); }}
          onRemove={() => { void onRemove(menu.project); setMenu(null); }}
        />
      )}
    </nav>
  );
};

// ── Column ───────────────────────────────────────────────────────────

const Column: React.FC<{
  status: string;
  tasks: BacklogTask[];
  singleProject: string | null;
  colorFor: (ref: { name: string; path: string }) => string;
  onCardOpen: (t: BacklogTask) => void;
  onDragStart: (id: string) => void;
  onDrop: () => void;
  onCreate: (projectPath: string, status: string, title: string) => void;
  onArchiveAll: () => void;
  onCardContext: (e: React.MouseEvent, t: BacklogTask) => void;
}> = ({ status, tasks, singleProject, colorFor, onCardOpen, onDragStart, onDrop, onCreate, onArchiveAll, onCardContext }) => {
  const [over, setOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const create = () => {
    const t = title.trim();
    if (!t || !singleProject) return;
    setCreating(false);
    setTitle('');
    onCreate(singleProject, status, t);
  };

  return (
    <div
      className={`backlog-column${over ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        onDrop();
      }}
    >
      <div className="backlog-col-header" style={{ ['--col-accent' as any]: statusColor(status) }}>
        <span className="backlog-col-name">
          <span className="backlog-col-dot" />
          {status}
        </span>
        {status.toLowerCase() === 'done' && tasks.length > 0 && (
          <button className="backlog-col-archive-all" onClick={onArchiveAll} title="Archive all Done tasks">
            Archive all
          </button>
        )}
        <span className="backlog-col-count">{tasks.length}</span>
      </div>
      <div className="backlog-col-body">
        {tasks.map((t) => (
          <Card
            key={`${t.project.path}::${t.id}::${t.file}`}
            task={t}
            color={colorFor(t.project)}
            onOpen={onCardOpen}
            onDragStart={onDragStart}
            onContext={onCardContext}
          />
        ))}
      </div>
      {singleProject && (
        creating ? (
          <div className="backlog-create">
            <input
              placeholder="New task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
                if (e.key === 'Escape') { setCreating(false); setTitle(''); }
              }}
              autoFocus
            />
          </div>
        ) : (
          <button className="backlog-col-add" onClick={() => setCreating(true)}>
            + Add task
          </button>
        )
      )}
    </div>
  );
};

// ── Card ─────────────────────────────────────────────────────────────

const Card: React.FC<{
  task: BacklogTask;
  color: string;
  onOpen: (t: BacklogTask) => void;
  onDragStart: (id: string) => void;
  onContext: (e: React.MouseEvent, t: BacklogTask) => void;
}> = ({ task, color, onOpen, onDragStart, onContext }) => {
  const pending = (task as BacklogTask & { pending?: boolean }).pending;
  return (
  <div
    className={`backlog-card${pending ? ' pending' : ''}`}
    draggable={!pending}
    onDragStart={() => onDragStart(`${task.project.path}::${task.id}`)}
    onClick={() => !pending && onOpen(task)}
    onContextMenu={(e) => !pending && onContext(e, task)}
  >
    <div className="backlog-card-title">{task.title}</div>
    <div className="backlog-card-meta">
      <span className="backlog-card-proj">
        <span className="backlog-proj-dot" style={{ background: color }} />
        {task.project.name}
      </span>
      <span className="backlog-card-id">{pending ? 'saving…' : task.id}</span>
      <span className="backlog-card-time">{pending ? '' : relativeTime(task.mtime)}</span>
    </div>
    {(task.assignee.length > 0 || task.labels.length > 0) && (
      <div className="backlog-card-chips">
        {task.assignee.map((a) => (
          <span key={a} className="backlog-chip assignee">{a}</span>
        ))}
        {task.labels.map((l) => (
          <span key={l} className="backlog-chip label">{l}</span>
        ))}
      </div>
    )}
  </div>
  );
};

// ── Task detail modal ────────────────────────────────────────────────

interface AcItem {
  index: number;
  checked: boolean;
  text: string;
}

const TaskDetail: React.FC<{
  task: BacklogTask;
  colorFor: (ref: { name: string; path: string }) => string;
  onClose: () => void;
  onArchive: (t: BacklogTask) => void;
  onChanged: () => void;
}> = ({ task, colorFor, onClose, onArchive, onChanged }) => {
  const [body, setBody] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  // Canonical description shown in the read view. Kept as state (not derived
  // from body) so a save can update it optimistically - otherwise the typed
  // text briefly vanishes while the file reloads.
  const [descValue, setDescValue] = useState('');
  const acRef = useRef<AcItem[]>([]);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const descViewRef = useRef<HTMLDivElement>(null);
  const bodyViewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const detail = await api().backlogGetTask(task.project.path, task.sub, task.file);
    const b = detail?.body || '';
    setBody(b);
    setDescValue(extractDescription(b));
    setLoading(false);
  }, [task]);

  useEffect(() => { void load(); }, [load]);

  // Parse acceptance criteria checkboxes out of the body.
  const acItems: AcItem[] = useMemo(() => {
    const out: AcItem[] = [];
    let n = 0;
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*\[([ xX])\]\s*(?:#\d+\s*)?(.*)$/);
      if (m) {
        n++;
        out.push({ index: n, checked: m[1].toLowerCase() === 'x', text: m[2].trim() });
      }
    }
    acRef.current = out;
    return out;
  }, [body]);

  const toggleAc = async (item: AcItem) => {
    setBusy(true);
    const r = await api().backlogEditTask({
      projectPath: task.project.path,
      taskId: task.id,
      checkAc: item.checked ? undefined : [item.index],
      uncheckAc: item.checked ? [item.index] : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'AC update failed'}`);
      return;
    }
    await load();
    onChanged();
  };

  const saveTitle = async () => {
    setEditingTitle(false);
    if (title.trim() === task.title || !title.trim()) {
      setTitle(task.title);
      return;
    }
    setBusy(true);
    const r = await api().backlogEditTask({
      projectPath: task.project.path,
      taskId: task.id,
      title: title.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'rename failed'}`);
      setTitle(task.title);
      return;
    }
    onChanged();
  };

  const saveDescription = async () => {
    setEditingDesc(false);
    if (descDraft === descValue) return;
    // Optimistically show the new text immediately so it never flashes empty.
    const prev = descValue;
    setDescValue(descDraft);
    const r = await api().backlogEditTask({
      projectPath: task.project.path,
      taskId: task.id,
      description: descDraft,
    });
    if (!r.ok) {
      setDescValue(prev); // revert on failure
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'description update failed'}`);
      return;
    }
    onChanged();
  };

  // Paste an image into the description: save it to the project's attachments
  // and insert a markdown image ref at the caret. (TASK-198)
  const onDescPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Use the Electron clipboard (reliably detects raw bitmaps/screenshots,
    // which clipboardData.items often misses) and only intercept when there's
    // genuinely an image - otherwise let normal text paste happen.
    let hasImage = false;
    try { hasImage = api().clipboardHasImage(); } catch { hasImage = false; }
    if (!hasImage) return;
    e.preventDefault();
    void doPasteImage();
  };

  const doPasteImage = async () => {
    const r = await api().backlogSaveImage(task.project.path);
    if (!r.ok || !r.relPath) {
      useTerminalStore.getState().addToast(`Backlog: ${r.error || 'image save failed'}`);
      return;
    }
    const md = `![image](${r.relPath})`;
    const el = descTextareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = descDraft.slice(0, start) + md + descDraft.slice(end);
      setDescDraft(next);
      requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = start + md.length; } catch { /* ignore */ } });
    } else {
      setDescDraft((d) => d + md);
    }
  };

  // Resolve relative <img> srcs in the rendered markdown (description + body)
  // to data URIs - the renderer can't load local files directly. Runs after
  // the markdown renders.
  useEffect(() => {
    const base = `${task.project.path.replace(/\\/g, '/')}/backlog/${task.sub}`;
    const resolve = (rel: string) => {
      const parts = base.split('/').filter(Boolean);
      for (const seg of rel.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.' && seg !== '') parts.push(seg);
      }
      return parts.join('/');
    };
    for (const root of [descViewRef.current, bodyViewRef.current]) {
      if (!root) continue;
      root.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (/^(https?:|data:)/i.test(src) || !src) return;
        void api().imageReadAsDataUrl(resolve(src)).then((url) => { if (url) img.setAttribute('src', url); });
      });
    }
  }, [descValue, editingDesc, loading, task.project.path, task.sub]);

  // Clean the raw body for display: drop Backlog.md's HTML section/AC markers,
  // the Description (shown as its own editable field above), and (when we have
  // an interactive AC list) the whole Acceptance Criteria section.
  const bodyText = useMemo(() => {
    let text = body.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/(^|\n)##\s*Description[\s\S]*?(?=\n##\s|$)/i, '');
    if (acItems.length > 0) {
      text = text.replace(/(^|\n)##\s*Acceptance Criteria[\s\S]*?(?=\n##\s|$)/i, '');
    }
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }, [body, acItems.length]);

  const bodyHtml = useMemo(
    () => DOMPurify.sanitize(marked(bodyText, { breaks: true, gfm: true }) as string),
    [bodyText],
  );

  return (
    <div className="backlog-detail-backdrop" onMouseDown={onClose}>
      <div className="backlog-detail" onMouseDown={(e) => e.stopPropagation()}>
        <div className="backlog-detail-header">
          <span className="backlog-detail-id">{task.id}</span>
          <span className="backlog-detail-status">{task.status}</span>
          <button className="shortcuts-close" onClick={onClose} title="Close (Esc)">&#10005;</button>
        </div>

        {editingTitle ? (
          <input
            className="backlog-detail-title-edit"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveTitle();
              if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); }
            }}
            autoFocus
          />
        ) : (
          <h2 className="backlog-detail-title" onClick={() => setEditingTitle(true)} title="Click to edit">
            {title}
          </h2>
        )}

        <div className="backlog-detail-sub">
          <span className="backlog-proj-dot" style={{ background: colorFor(task.project) }} />
          {task.project.name}
          {task.labels.map((l) => <span key={l} className="backlog-chip label">{l}</span>)}
          {task.assignee.map((a) => <span key={a} className="backlog-chip assignee">{a}</span>)}
        </div>

        {!loading && (
          <div className="backlog-detail-desc">
            <div className="backlog-detail-section-h">Description</div>
            {editingDesc ? (
              <textarea
                ref={descTextareaRef}
                className="backlog-detail-desc-edit"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onPaste={(e) => void onDescPaste(e)}
                onBlur={() => void saveDescription()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditingDesc(false); }
                  // Ctrl/Cmd+Enter saves; plain Enter inserts a newline.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveDescription(); }
                }}
                placeholder="Describe the task. Paste an image to attach it."
                autoFocus
              />
            ) : descValue ? (
              <div
                ref={descViewRef}
                className="md-rendered-content backlog-detail-md backlog-detail-desc-view"
                title="Click to edit"
                onClick={() => { setDescDraft(descValue); setEditingDesc(true); }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked(descValue, { breaks: true, gfm: true }) as string) }}
              />
            ) : (
              <div
                className="backlog-detail-desc-empty"
                onClick={() => { setDescDraft(''); setEditingDesc(true); }}
              >
                Add a description…
              </div>
            )}
          </div>
        )}

        {acItems.length > 0 && (
          <div className="backlog-detail-ac">
            <div className="backlog-detail-section-h">Acceptance Criteria</div>
            {acItems.map((item) => (
              <label key={item.index} className="backlog-ac-row">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={busy}
                  onChange={() => void toggleAc(item)}
                />
                <span className={item.checked ? 'done' : ''}>{item.text}</span>
              </label>
            ))}
          </div>
        )}

        <div className="backlog-detail-body">
          {loading ? (
            <div className="backlog-detail-loading">Loading...</div>
          ) : bodyText ? (
            <div
              ref={bodyViewRef}
              className="md-rendered-content backlog-detail-md"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : null}
        </div>

        <div className="backlog-detail-footer">
          <button
            className="backlog-detail-archive"
            onClick={() => void api().fileReveal(taskFilePath(task))}
            title="Show the task's .md file in your file manager"
          >
            Reveal file
          </button>
          <span style={{ flex: 1 }} />
          <button className="backlog-detail-archive" disabled={busy} onClick={() => onArchive(task)}>
            Archive
          </button>
          <button className="backlog-detail-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BacklogBoard;
