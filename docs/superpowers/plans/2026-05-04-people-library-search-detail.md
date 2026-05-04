# People Library Search Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add built-in/custom tabs, search, and built-in prompt detail preview to the people library modal.

**Architecture:** Reuse the current `peopleLibraryView` rendering boundary. Add people-library-only filter state to `TeamPageState`, wire new DOM refs from `team.html`, filter templates before pagination, and open a small read-only modal for built-in prompt details.

**Tech Stack:** TypeScript, DOM APIs, Vitest jsdom tests, existing `public/team.html` and `public/team.css`.

---

### Task 1: Lock UI Contract With Tests

**Files:**
- Modify: `src/teamPage/peopleLibraryView.test.ts`
- Modify: `src/teamPage/domRefs.test.ts`
- Modify: `src/teamPage/teamHtml.test.ts`

- [ ] **Step 1: Add failing tests for people-library tabs/search**

Add a test that creates one built-in and one custom template, renders the library, confirms built-ins are shown first, then clicks the custom tab and confirms only custom entries remain. Add a second test where search matches prompt text and resets to the first page.

- [ ] **Step 2: Add failing tests for prompt detail preview**

Extend the jsdom setup with `builtinTemplateDetailModalEl`, `builtinTemplateDetailTitleEl`, `builtinTemplateDetailMetaEl`, `builtinTemplateDetailPromptEl`, and `closeBuiltinTemplateDetailEl`. Verify clicking a built-in card’s `详情` button opens the modal and renders the full prompt text.

- [ ] **Step 3: Add DOM/HTML contract tests**

Assert `team.html` contains `people-library-search`, `people-library-tab-builtin`, `people-library-tab-custom`, `builtin-template-detail-modal`, and prompt preview CSS. Update `domRefs.test.ts` fixture with those elements.

### Task 2: Implement State, DOM Refs, and Markup

**Files:**
- Modify: `src/teamPage/appState.ts`
- Modify: `src/teamPage/domRefs.ts`
- Modify: `public/team.html`
- Modify: `public/team.css`

- [ ] **Step 1: Add state**

Add `peopleLibraryTemplateType: 'builtin' | 'custom'`, `peopleLibrarySearchQuery: string`, and `previewTemplateId?: string` to `TeamPageState`. Initialize to built-in and empty search.

- [ ] **Step 2: Add DOM refs**

Expose people-library search/tab refs and built-in detail modal refs through `TeamPageDomRefs`.

- [ ] **Step 3: Add markup and styling**

Insert a toolbar above `people-library-list` with a search input and two tabs. Add a separate read-only detail modal after the editor modal. Style the prompt preview as a scrollable code-like panel.

### Task 3: Implement Rendering Behavior

**Files:**
- Modify: `src/teamPage/peopleLibraryView.ts`

- [ ] **Step 1: Filter people-library templates**

Create `filteredPeopleLibraryTemplates()` that filters `deps.getTemplates()` by `state.peopleLibraryTemplateType` and search query against name, description, and system prompt.

- [ ] **Step 2: Wire tabs and search**

On people-library open, reset to built-in and empty search. On tab click and search input, update state, reset pagination to page 0, and rerender.

- [ ] **Step 3: Add built-in prompt detail**

Add a `详情` action for built-in template cards. Fill and show the detail modal with name, type/site metadata, and full prompt. Close it from the close button and from `closePeopleModals()`.

### Task 4: Verify and Merge

**Files:**
- All changed files above.

- [ ] **Step 1: Run focused tests**

Run `npm test -- src/teamPage/peopleLibraryView.test.ts src/teamPage/domRefs.test.ts src/teamPage/teamHtml.test.ts`.

- [ ] **Step 2: Run full checks**

Run `npm run typecheck`, `npm test`, and `npm run build`.

- [ ] **Step 3: Commit and merge**

Commit the feature branch, merge it back to `main`, rerun focused checks on `main`, and remove the temporary worktree.
