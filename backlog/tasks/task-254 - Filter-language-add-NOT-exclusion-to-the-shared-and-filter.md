---
id: TASK-254
title: 'Filter language: add NOT (exclusion) to the shared and-filter'
status: To Do
assignee: []
created_date: '2026-06-21 17:44'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared src/shared/and-filter.ts supports only AND across the app's search inputs (command palette, file explorer, dir picker, diff review, prompt search, session monitors). Add NOT-as-exclusion: a token can be negated so matching items must NOT contain it. Syntax 'NOT term' (whole-word, mirrors AND) and optionally leading '-term'. Design: keep tokenizeAnd returning an ARRAY (so the 9 callers' 'tokens.length === 0' short-circuits keep working) but change element type from string to {term: string; negate: boolean}; matchesAllTokens honors negate (exclude tokens must be absent). Caveat: PromptSearchDialog reads token strings for highlighting - update to read .term and skip negated tokens. No existing and-filter tests - add unit tests. OR is out of scope (the shared filter has no OR today).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 'foo NOT bar' matches haystacks containing foo but not bar
- [ ] #2 'NOT bar' (exclusion only) excludes haystacks containing bar, includes the rest
- [ ] #3 Existing AND-only queries behave identically (no regression)
- [ ] #4 All callers' empty-query short-circuit (tokens.length === 0) still works
- [ ] #5 Prompt-search highlighting ignores negated terms
<!-- AC:END -->
