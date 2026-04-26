---
id: TASK-11
title: LLM-generated session summaries (option 3 from session summary discussion)
status: To Do
assignee: []
created_date: '2026-04-26 10:28'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current session summary popover uses a structured prompt timeline (How it started / Along the way / Most recent). Users wanted a true narrative like the conversational summaries an LLM produces. Option 3 from the design discussion: actually call an LLM with the session's prompt history and render the narrative. Needs config UX (which provider, what API key, opt-in or opt-out) and budget controls (don't blow a key on every popover open - cache per session signature).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settings: AI summary provider (Anthropic / OpenAI / Azure / off), API key field, model selector
- [ ] #2 Click 'Generate narrative' button in the SessionSummary popover - not auto on every open, so it's an explicit cost
- [ ] #3 Cache the result by sessionId+messageCount; reuse if nothing has changed
- [ ] #4 Fallback gracefully when key is missing or rate limit hit (show structured timeline instead)
- [ ] #5 Privacy: never send prompts that contain secrets - filter messages with patterns matching API keys, tokens, etc.
<!-- AC:END -->
