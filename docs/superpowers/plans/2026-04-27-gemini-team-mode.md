# Gemini Team Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first version of Gemini team mode described in `docs/superpowers/specs/2026-04-27-gemini-team-mode-design.md`.

**Architecture:** Keep Chrome API code at the edges. Put `@` parsing and room state transitions in shared pure modules with tests, then let the background worker own tab creation/routing and the content script own Gemini DOM integration plus the floating host panel.

**Tech Stack:** TypeScript, Vite MV3 extension build, Chrome `tabs`/`runtime` APIs, Vitest for pure module tests.

---

### Task 1: Test Harness And Pure Contracts

**Files:**
- Modify: `package.json`
- Create: `src/team/types.ts`
- Create: `src/team/messageParser.ts`
- Create: `src/team/messageParser.test.ts`
- Create: `src/team/teamRoom.ts`
- Create: `src/team/teamRoom.test.ts`

- [ ] Add `npm test` using Vitest.
- [ ] Write failing tests for `parseTeamMention(raw, roles)`.
- [ ] Write failing tests for role creation, targeted routing, `@all` routing, normal-message no-send behavior, reply capture, and closed-tab offline behavior.
- [ ] Implement the smallest shared modules needed to pass tests.

### Task 2: Background Room Runtime

**Files:**
- Modify: `src/background/index.ts`
- Use: `src/team/types.ts`
- Use: `src/team/messageParser.ts`
- Use: `src/team/teamRoom.ts`

- [ ] Handle `TEAM_HOST_READY`, `TEAM_CREATE_ROLE`, `TEAM_REMOVE_ROLE`, and `TEAM_SEND_MESSAGE`.
- [ ] Create role tabs with `chrome.tabs.create({ active: false })`.
- [ ] Bind `TEAM_ROLE_READY` registrations to opening roles by `tabId`.
- [ ] Route `TEAM_SEND_PROMPT` to matching online role tabs.
- [ ] Push `TEAM_STATE_UPDATED`, `TEAM_ROLE_REPLY`, and `TEAM_ERROR` to the host tab.
- [ ] Mark roles offline on tab close.

### Task 3: Content Script Role Behavior

**Files:**
- Modify: `src/content/index.ts`

- [ ] Reuse `fillAndSend`, `observeResponseContainers`, `extractCleanText`, and `getConversationId`.
- [ ] Register role pages with `TEAM_ROLE_READY`.
- [ ] Handle `TEAM_ASSIGN_ROLE` and persist the assigned role identity in memory.
- [ ] On `TEAM_SEND_PROMPT`, set status to `sending`, fill/send, set status to `generating`, then report stable replies once per hash and set status to `idle`.
- [ ] Report `error` status when Gemini input or send button is unavailable.

### Task 4: Host Floating Panel

**Files:**
- Modify: `src/content/index.ts`

- [ ] Inject one floating launcher and expandable panel on Gemini pages.
- [ ] Render role list with status, generating state, and remove buttons.
- [ ] Render group messages from `TeamRoomState`.
- [ ] Add role creation prompt and send box.
- [ ] Send raw input to background and keep normal non-mention messages visible without routing.

### Task 5: Verification

**Files:**
- Read: `docs/superpowers/specs/2026-04-27-gemini-team-mode-design.md`

- [ ] Run `npm install` if Vitest is missing from `node_modules`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Check build output includes `dist/content.js`, `dist/background.js`, and `dist/manifest.json`.
- [ ] Re-read the first-version acceptance criteria and list any manual-browser-only gaps.
