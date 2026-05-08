import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { CopilotSessionSummary } from '../shared/copilot-types';

interface SessionRow {
  id: string;
  cwd: string;
  repository: string;
  branch: string;
  summary: string;
  updated_at: string;
  created_at: string;
}

interface TurnStatsRow {
  session_id: string;
  message_count: number;
  latest_prompt: string | null;
  latest_prompt_time: string | null;
}

interface SearchResultRow {
  id: string;
  cwd: string;
  repository: string;
  branch: string;
  summary: string;
  updated_at: string;
  created_at: string;
}

export class CopilotSessionDB {
  private db: any | null = null;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(os.homedir(), '.copilot', 'session-store.db');
  }

  /**
   * Attempt to open the SQLite database read-only. Returns true if successful.
   * Gracefully returns false if the DB doesn't exist or can't be opened.
   */
  open(): boolean {
    if (this.db) return true;

    if (!fs.existsSync(this.dbPath)) {
      console.log(`[copilot-session-db] DB not found: ${this.dbPath}`);
      return false;
    }

    try {
      const Database = require('better-sqlite3');
      this.db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
      // No need to set WAL mode — readers inherit it automatically from the DB.
      // The CLI (the writer) already creates the DB in WAL mode.
      console.log(`[copilot-session-db] Opened: ${this.dbPath}`);
      return true;
    } catch (err) {
      console.error(`[copilot-session-db] Failed to open: ${err}`);
      return false;
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors
      }
      this.db = null;
    }
  }

  /**
   * Query sessions ordered by updated_at descending, limited to top N.
   * Returns null if the DB is unavailable or the query fails.
   */
  querySessions(limit = 314): SessionRow[] | null {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT id, cwd, repository, branch, summary, updated_at, created_at
        FROM sessions
        WHERE updated_at > datetime('now', '-30 days')
        ORDER BY updated_at DESC
        LIMIT ?
      `);
      return stmt.all(limit) as SessionRow[];
    } catch {
      return null;
    }
  }

  /**
   * Batch-query turn statistics for a list of session IDs.
   * Returns a Map of session_id -> TurnStatsRow. Missing sessions will not be in the map.
   */
  queryTurnStats(sessionIds: string[]): Map<string, TurnStatsRow> | null {
    if (!this.db || sessionIds.length === 0) return null;

    try {
      const placeholders = sessionIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        SELECT
          session_id,
          COUNT(*) as message_count,
          (SELECT user_message FROM turns t2 WHERE t2.session_id = t1.session_id ORDER BY timestamp DESC LIMIT 1) as latest_prompt,
          MAX(timestamp) as latest_prompt_time
        FROM turns t1
        WHERE session_id IN (${placeholders})
        GROUP BY session_id
      `);

      const rows = stmt.all(...sessionIds) as TurnStatsRow[];
      const map = new Map<string, TurnStatsRow>();
      for (const row of rows) {
        map.set(row.session_id, row);
      }
      return map;
    } catch {
      return null;
    }
  }

  /**
   * Full-text search using FTS5 search_index table.
   * Returns null if the DB is unavailable or the query fails.
   */
  searchSessions(query: string, limit = 50): SearchResultRow[] | null {
    if (!this.db || !query.trim()) return null;

    try {
      // If the query contains FTS5 boolean operators (AND/OR/NOT), pass it
      // through as-is so users can do structured searches. Otherwise, wrap
      // each word in double-quotes so special chars like #, (, ) don't cause
      // FTS5 syntax errors. Words are implicitly ANDed by FTS5.
      const hasOperators = /\b(AND|OR|NOT)\b/.test(query);
      let ftsQuery: string;
      if (hasOperators) {
        // Wrap each non-operator token in quotes, keep operators bare
        const parts = query
          .split(/\b(AND|OR|NOT)\b/)
          .map(part => /^(AND|OR|NOT)$/.test(part.trim()) ? part.trim() : '"' + part.trim().replace(/"/g, ' ') + '"')
          .filter(p => p && p !== '""');
        // Strip trailing/leading operators (user still typing)
        while (parts.length > 0 && /^(AND|OR|NOT)$/.test(parts[parts.length - 1])) parts.pop();
        while (parts.length > 0 && /^(AND|OR|NOT)$/.test(parts[0])) parts.shift();
        ftsQuery = parts.join(' ');
      } else {
        // Wrap each word individually in quotes (implicit AND)
        ftsQuery = query
          .split(/\s+/)
          .filter(w => w.length > 0)
          .map(w => '"' + w.replace(/"/g, '') + '"')
          .join(' ');
      }
      if (!ftsQuery.trim()) return null;

      const stmt = this.db.prepare(`
        SELECT DISTINCT s.id, s.cwd, s.repository, s.branch, s.summary, s.updated_at, s.created_at
        FROM search_index si
        JOIN sessions s ON s.id = si.session_id
        WHERE search_index MATCH ?
        ORDER BY s.updated_at DESC
        LIMIT ?
      `);

      const results = stmt.all(ftsQuery, limit) as SearchResultRow[];
      console.log(`[copilot-session-db] search '${query}' → FTS5: ${ftsQuery} → ${results.length} results`);
      return results;
    } catch (err) {
      console.error(`[copilot-session-db] search failed: ${err}`);
      // FTS5 query may still fail on complex input - gracefully return null
      return null;
    }
  }

  /**
   * Get total count of eligible sessions (within the 30-day window).
   */
  getTotalEligibleCount(): number | null {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM sessions
        WHERE updated_at > datetime('now', '-30 days')
      `);
      const row = stmt.get() as { count: number } | undefined;
      return row?.count ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Search user prompts across ALL sessions using LIKE on the turns table.
   * Supports AND/OR operators for multi-term searches.
   */
  searchPrompts(query: string, limit = 100): Array<{
    session_id: string;
    user_message: string;
    timestamp: string;
    summary: string;
    cwd: string;
  }> | null {
    if (!this.db || !query.trim()) return null;

    try {
      const hasOperators = /\b(AND|OR)\b/.test(query);
      if (hasOperators) {
        // Split on AND/OR, build SQL WHERE with LIKE per term
        const parts = query.split(/\b(AND|OR)\b/).map(p => p.trim()).filter(p => p);
        const conditions: string[] = [];
        const params: string[] = [];
        let currentOp = 'AND';
        for (const part of parts) {
          if (part === 'AND' || part === 'OR') {
            currentOp = part;
          } else if (part) {
            if (conditions.length > 0) {
              conditions.push(currentOp);
            }
            conditions.push('t.user_message LIKE ?');
            params.push(`%${part}%`);
          }
        }
        if (conditions.length === 0) return null;
        const whereClause = conditions.join(' ');
        const stmt = this.db.prepare(`
          SELECT t.session_id, t.user_message, t.timestamp, s.summary, s.cwd
          FROM turns t
          JOIN sessions s ON s.id = t.session_id
          WHERE (${whereClause})
          AND t.user_message IS NOT NULL AND length(t.user_message) > 3
          ORDER BY t.timestamp DESC
          LIMIT ?
        `);
        return stmt.all(...params, limit) as any[];
      }

      const stmt = this.db.prepare(`
        SELECT t.session_id, t.user_message, t.timestamp, s.summary, s.cwd
        FROM turns t
        JOIN sessions s ON s.id = t.session_id
        WHERE t.user_message LIKE ?
        AND t.user_message IS NOT NULL AND length(t.user_message) > 3
        ORDER BY t.timestamp DESC
        LIMIT ?
      `);
      return stmt.all(`%${query}%`, limit) as any[];
    } catch {
      return null;
    }
  }
}

/**
 * Helper to convert a SessionRow + TurnStatsRow into a CopilotSessionSummary.
 * Sets status='idle', toolCallCount=0, pendingToolCalls=0 for SQLite-sourced sessions
 * (live status comes from the events.jsonl watcher).
 */
export function sessionRowToSummary(
  row: SessionRow,
  turnStats?: TurnStatsRow
): CopilotSessionSummary {
  const messageCount = turnStats?.message_count ?? 0;
  const latestPrompt = turnStats?.latest_prompt
    ? turnStats.latest_prompt.slice(0, 120)
    : undefined;

  let latestPromptTime: number | undefined;
  if (turnStats?.latest_prompt_time) {
    try {
      latestPromptTime = new Date(turnStats.latest_prompt_time).getTime();
    } catch {
      latestPromptTime = undefined;
    }
  }

  let lastActivityTime = 0;
  try {
    lastActivityTime = new Date(row.updated_at).getTime();
  } catch {
    lastActivityTime = 0;
  }

  return {
    id: row.id,
    provider: 'copilot',
    status: 'idle',
    cwd: row.cwd || '',
    branch: row.branch || '',
    repository: row.repository || '',
    summary: row.summary || '',
    messageCount,
    toolCallCount: 0,
    lastActivityTime,
    latestPrompt,
    latestPromptTime,
  };
}
