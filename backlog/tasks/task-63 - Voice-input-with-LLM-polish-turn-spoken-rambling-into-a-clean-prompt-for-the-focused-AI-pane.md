---
id: TASK-63
title: >-
  Voice input with LLM polish - turn spoken rambling into a clean prompt for the
  focused AI pane
status: To Do
assignee: []
created_date: '2026-05-02 19:22'
updated_date: '2026-05-04 20:29'
labels:
  - major-version
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tmax user asked whether tmax could support a WispFlow-style voice input flow where the user speaks freely ("rambling") and an LLM polish step rewrites it into a clean, structured prompt before sending it to the focused AI pane (Claude Code, Copilot CLI, etc.). Their words: "i want it to turn my rambling into a solid prompt".

The ask has two parts:
  1. Speech-to-text - get the audio to text. Could be first-party (Whisper/Whisper.cpp running locally), system-provided (Win+H, Mac dictation), or third-party (WispFlow, Talon).
  2. LLM polish - rewrite the raw transcript into a structured prompt. Distinct from raw STT - this is the part the user explicitly called out as the value-add.

This is a Discovery task, not a feature commitment. Goal: scope the options and pick a direction before any implementation.

Context on tmax-adjacent work that might inform the decision:
  - TASK-41 / TASK-42 / TASK-53 / TASK-57 already touched Voice Access compatibility (UIA hide-textarea pattern). If the lightweight option (rely on the user external voice tool) is the pick, that work probably matters.
  - tmax already monitors AI sessions and fires OS notifications (src/main/copilot-notification.ts) - there is a notification surface area to extend with voice if useful.

Directions to evaluate:
  A. **First-party voice + polish** - record audio in tmax, pipe to Whisper (cloud or local), pipe transcript to a polish prompt against Claude/GPT, insert into focused pane. Largest scope. Owns the whole UX.
  B. **Lightweight: external STT + polish-only feature** - the user keeps using WispFlow/Win+H/Mac dictation for STT; tmax adds a hotkey that takes the current input-line (or selection) and rewrites it via LLM polish. Smallest scope. Composable with the user existing tools.
  C. **Compatibility check only** - confirm WispFlow / similar inject keystrokes cleanly into tmax panes without UIA / focus issues, fix any tmax-side regressions. Smallest possible scope. No new feature, just removing friction.

Decision should consider: who runs the polish LLM (user BYO API key vs tmax-bundled), whether to keep the polished prompt in scrollback (audit trail), and whether to support multiple agent flavors (Claude Code prefers different prompt structure than Copilot CLI).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Direction picked among A / B / C with a one-paragraph rationale, captured in the task notes
- [ ] #2 If direction is A or B: a follow-up implementation task is filed with concrete ACs (this task closes as Discovery only)
- [ ] #3 If direction is C: the compatibility test plan is captured (which voice tools to test, on which OS, what to assert)
<!-- AC:END -->
