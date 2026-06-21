---
id: TASK-254
title: 'Filter language: add NOT (exclusion) to the shared and-filter'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 17:44'
updated_date: '2026-06-21 18:38'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared src/shared/and-filter.ts supports only AND across the app's search inputs (command palette, file explorer, dir picker, diff review, prompt search, session monitors). Add NOT-as-exclusion: a token can be negated so matching items must NOT contain it. Syntax 'NOT term' (whole-word, mirrors AND) and optionally leading '-term'. Design: keep tokenizeAnd returning an ARRAY (so the 9 callers' 'tokens.length === 0' short-circuits keep working) but change element type from string to {term: string; negate: boolean}; matchesAllTokens honors negate (exclude tokens must be absent). Caveat: PromptSearchDialog reads token strings for highlighting - update to read .term and skip negated tokens. No existing and-filter tests - add unit tests. OR is out of scope (the shared filter has no OR today).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 'foo NOT bar' matches haystacks containing foo but not bar
- [x] #2 'NOT bar' (exclusion only) excludes haystacks containing bar, includes the rest
- [x] #3 Existing AND-only queries behave identically (no regression)
- [x] #4 All callers' empty-query short-circuit (tokens.length === 0) still works
- [x] #5 Prompt-search highlighting ignores negated terms
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added NOT (exclusion) to the shared filter grammar (src/shared/and-filter.ts), used by the command palette, file explorer, dir picker, dir panel, diff review, prompt search, and session monitors.

Grammar: `NOT` (whole word, mirrors AND) or a leading `-` negates the following clause - "foo NOT bar" = contains foo but not bar; "NOT bar" = excludes bar; "foo AND -bar" works too. NOT also acts as a clause separator so it does not need an explicit AND.

Token shape changed from string[] to QueryToken[] ({term, negate}) but kept an ARRAY, so all 9 callers' "tokens.length === 0" short-circuits keep working untouched; matchesAllTokens now requires include terms present and negated terms absent. Updated PromptSearchDialog highlight to read .term and skip negated terms.

Tests: tests/unit/shared/and-filter.test.ts (11 tests - AND preserved, NOT, standalone NOT, leading -, combined, dangling operators, hyphenated-term safety). Full unit suite 131 passing; typecheck no new errors. OR remains out of scope (the shared filter never had it).
<!-- SECTION:FINAL_SUMMARY:END -->
