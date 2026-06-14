/**
 * Pure helper for updating the prompt-composer's per-terminal draft map.
 *
 * Why this lives here: the actual store action in `terminal-store.ts`
 * needs to read-modify-write through zustand, but the actual update rule
 * is simple and worth pinning with focused tests:
 *   - non-empty draft → store the string under terminalId
 *   - empty draft     → remove the terminalId key entirely (so the map
 *                       doesn't accumulate empty entries for every pane
 *                       the user ever opened the composer in)
 *
 * Returns a NEW object - never mutates the input. The caller decides
 * whether to skip the `set()` when nothing changed (cheap reference
 * equality check), but for now the store always commits because draft
 * updates fire on every keystroke and will essentially always differ.
 */
export function updateComposerDrafts(
  drafts: Record<string, string>,
  terminalId: string,
  draft: string,
): Record<string, string> {
  const next = { ...drafts };
  if (draft) {
    next[terminalId] = draft;
  } else {
    delete next[terminalId];
  }
  return next;
}

/**
 * Drop a terminal's draft when its owning pane is closed. Returns the
 * same reference when there was nothing to drop, so the store can do a
 * cheap referential check before committing a new object.
 */
export function dropComposerDraft(
  drafts: Record<string, string>,
  terminalId: string,
): Record<string, string> {
  if (!Object.prototype.hasOwnProperty.call(drafts, terminalId)) {
    return drafts;
  }
  const next = { ...drafts };
  delete next[terminalId];
  return next;
}
