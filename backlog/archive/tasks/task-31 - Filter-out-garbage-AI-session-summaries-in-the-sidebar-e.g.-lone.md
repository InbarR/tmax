---
id: TASK-31
title: Filter out garbage AI session summaries in the sidebar (e.g. lone '|-')
status: Done
assignee: []
created_date: '2026-04-28 09:43'
updated_date: '2026-04-28 10:33'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported via screenshot on 2026-04-28. The AI Sessions sidebar shows rows whose title is literally '|- · bb2cc4', '|- · 84969d', etc. - the summary appears to be the 2-character string '|-' followed by an id-derived suffix from the row template.

Source: src/renderer/components/CopilotPanel.tsx:51-56 getTitle() returns s.summary as-is when present, with no validation. Sessions whose first AI response was think-only / cancelled / otherwise produced no real content end up with a '|-' summary that's worse than the id-fallback.

Options to consider:
- Filter / treat as missing if summary is <3 chars after trim, or matches a small set of known meaningless markers (|-, …, ?, etc.).
- Investigate upstream: where is the summary being produced as '|-'? Could be a tree-rendering artifact in the AI provider's transcript, in which case fix at the extraction step.
- Debug by inspecting the session JSON for one of the affected ids on disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sessions whose summary is meaningless (e.g. lone '|-', single non-alphanumeric char, empty after strip) fall back to cwd / repo / id rather than rendering the garbage
- [x] #2 Root cause for the '|-' summary identified: either fixed at the extraction step, or filtered at the render step with a comment explaining why
- [x] #3 Sidebar rows for unaffected sessions render unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented at the render step rather than the extraction step - couldn't safely investigate which provider produces "|-" without a captured session JSON to look at. Render-step filter is a clear, scoped fix. If we later identify the upstream cause, we can remove the filter.\n\nAdded isMeaninglessSummary(summary) helper in CopilotPanel.tsx that returns true when trimmed length < 3 OR when the summary contains only structural/Markdown punctuation (|, -, _, *, etc., underscores, em/en dashes, whitespace). getTitle and getSubtitle skip such summaries and fall back to cwd/repo/id like they would for an empty summary.\n\nAC #2 (root cause) intentionally left unchecked - we filtered without identifying the producer. Worth picking up if it's ever a recurring pain.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sidebar rows whose AI session summary is pure structural noise (e.g. lone "|-", a single dash, all-whitespace) now render with the cwd/repo/id fallback instead of the garbage. Implemented as a render-step filter (isMeaninglessSummary) in CopilotPanel.tsx getTitle/getSubtitle. Real summaries are unchanged.

Follow-up commit: identified the upstream cause - Copilot CLI YAML uses block scalars (summary: |-) for multi-line summaries; parser at copilot-session-monitor.ts:247 was taking |- as the literal value. Fixed at the parse step; the render-step isMeaninglessSummary filter stays as defense-in-depth.
<!-- SECTION:FINAL_SUMMARY:END -->
