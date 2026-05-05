import type { Grant, GrantLevel, PermissionsAPI } from './mcp-types';

/**
 * Default-deny in-memory grants store.
 *
 * v1 design notes (per `PLAN_CROSS_PANE_MCP_V1.md`):
 *  - Grants live only in memory — no persistence across app restarts.
 *  - Auto-revoke is the caller's responsibility (main wires `revokeAllForPane`
 *    into pane-close + agent-exit hooks).
 *  - 'session' implies 'buffer' on the same target. We model that in `resolve`
 *    so agents granted 'session' don't need a separate buffer grant.
 *  - An agent always has implicit access to its own pane.
 */
export class PermissionsStore implements PermissionsAPI {
  private grants = new Map<string, Grant>();
  private listeners = new Set<() => void>();

  private key(grantee: string, target: string): string {
    return `${grantee}::${target}`;
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* swallow listener errors */ }
    }
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  list(): Grant[] {
    return Array.from(this.grants.values());
  }

  grant(granteePane: string, targetPane: string, level: GrantLevel): Grant {
    if (granteePane === targetPane) {
      // Self-access is implicit (see `resolve` below) — we return a synthetic
      // record so callers always get a Grant back, but we deliberately do NOT
      // add it to the store. That's consistent with `list()` not surfacing
      // self-grants in the matrix UI. The renderer dialog already filters
      // self out of the targets column, so this branch is rarely hit.
      return { granteePane, targetPane, level, grantedAt: Date.now() };
    }
    const grant: Grant = { granteePane, targetPane, level, grantedAt: Date.now() };
    this.grants.set(this.key(granteePane, targetPane), grant);
    this.notify();
    return grant;
  }

  revoke(granteePane: string, targetPane: string): void {
    if (this.grants.delete(this.key(granteePane, targetPane))) {
      this.notify();
    }
  }

  revokeAllForPane(paneId: string): void {
    let changed = false;
    for (const [k, g] of this.grants) {
      if (g.granteePane === paneId || g.targetPane === paneId) {
        this.grants.delete(k);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  resolve(granteePane: string, targetPane: string): GrantLevel | null {
    if (granteePane === targetPane) return 'session';
    const g = this.grants.get(this.key(granteePane, targetPane));
    return g ? g.level : null;
  }

  clear(): void {
    if (this.grants.size === 0) return;
    this.grants.clear();
    this.notify();
  }
}
