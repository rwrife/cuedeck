# CueDeck Studio UX Redesign

**Date:** 2026-07-14  
**Status:** Approved design, pending issue creation

## Purpose

CueDeck's features work, but the desktop experience exposes them as a collection of controls instead of guiding a presenter through a coherent job. The redesign should make the app immediately approachable to any presenter, including non-technical users, while preserving the power features used by technical demo owners.

The target experience is a professional demo studio organized around four user tasks:

1. **Library** — find or start a demo.
2. **Build** — plan the story and prepare content.
3. **Rehearse** — check readiness and practice the run.
4. **Present** — deliver the demo from a focused compact surface.

## Current Experience Findings

The existing implementation has a sound domain model and useful features, but its composition creates avoidable friction:

- The landing screen puts create, import, and settings in one control row without explaining CueDeck's concepts or giving first-time guidance.
- Creating a deck opens an empty editor with no active card, leaving the user to discover that a card must be added before work can begin.
- The workspace header gives Search, Present, Export, Live Control, Settings, and Pin equal visual weight. Advanced and infrequent actions compete with the primary authoring flow.
- Product terminology such as cards, snippets, variables, Markdown, live control, and MCP appears before a non-technical presenter has a task-based mental model.
- Variables are embedded in every card editor even though they are deck-level, advanced configuration.
- Add-card and add-snippet operations create generic content but do not focus the new title or content field.
- Deck, card, snippet, and variable deletion can happen from a single click without confirmation or undo.
- Export feedback is stored globally but is only rendered on the deck picker, so workspace export success or failure is not visible where the action occurred.
- Deck actions are hover-revealed, which makes them undiscoverable and weak for keyboard or touch-style interaction.
- Raw emoji are used as functional iconography, and the default Electron application menu remains visible, reinforcing an unfinished appearance.
- Presenter Mode is useful but has no preceding rehearsal/readiness workflow and can leave substantial unused space when a step has little content.
- The application has no explicit UX for deck rename, duplicate, templates, readiness, or a complete first-run journey.

## Chosen Direction

### Full studio redesign

CueDeck will use a persistent studio shell with four modes: Library, Build, Rehearse, and Present.

This direction was selected over:

- **Polish in place:** lower risk, but it would preserve the dense header and editor-first mental model.
- **Progressive workflow within current screens:** improves disclosure, but does not create a strong enough separation between authoring, readiness, and delivery.

The full studio approach is larger, but it directly addresses app flow, discoverability, and professional cohesion.

## Information Architecture

### Library

**User question:** What am I working on?

Responsibilities:

- Show decks with meaningful status and metadata.
- Provide search and sorting as the collection grows.
- Offer a guided New Demo flow: blank demo, starter template, or import.
- Put rename, duplicate, export, and delete in a deck-level overflow menu.
- Teach the core model through the first-run empty state and an optional sample deck.

The Library replaces the current picker as the durable home surface.

### Build

**User question:** What will happen in my demo?

Responsibilities:

- Show the running order in a stable step navigator.
- Edit a step's title, talking points, and paste-ready content.
- Focus newly created steps and content immediately.
- Use plain-language labels in primary UI while retaining file-format terminology in documentation and advanced areas.
- Move variables, Markdown details, live control, import/export, and similar technical features into contextual advanced panels or menus.
- Provide one primary next action: Rehearse.

Internally, steps remain cue cards and paste-ready content remains snippets. The redesign does not require a deck schema migration.

### Rehearse

**User question:** Am I ready to present?

Responsibilities:

- Provide a read-only, full-window run-through using rendered talking points and real navigation.
- Compute a preflight summary from the current deck.
- Flag empty titles, missing variable values, steps with no useful content, and other actionable readiness concerns.
- Link warnings to the exact Build location that resolves them.
- Inform rather than block; users may present with warnings.
- Provide one primary next action: Start Presenting.

Readiness is derived state and is not persisted in the deck.

### Present

**User question:** What do I need right now?

Responsibilities:

- Retain only the active step, rendered talking points, paste actions, progress, and previous/next navigation.
- Keep copy feedback unmistakable and expose keyboard shortcuts without requiring them.
- Preserve always-on-top and compact-window behavior.
- Return to Rehearse on exit and restore the prior window bounds and on-top state.
- Adapt spacing so sparse steps do not look broken or unfinished.

## Studio Shell

The shell uses a persistent mode rail for Library, Build, Rehearse, Present, and Settings.

Key behavior:

- The current mode and the next logical action are always clear.
- Build, Rehearse, and Present are unavailable until a deck is open; the Library remains usable at all times.
- Build and Rehearse retain deck context and running-order navigation.
- Library owns deck-level collection operations.
- Present intentionally becomes a reduced compact shell.
- Advanced technical functions do not occupy the global primary-action area.
- At narrow supported widths, labels may collapse while accessible names and tooltips remain.

The default Electron menu should be removed on Windows/Linux or replaced with deliberate app commands. Product iconography should use one consistent icon set rather than emoji.

## Visual Direction

CueDeck should feel like a calm, professional production tool rather than a themed collection of forms.

Principles:

- Neutral canvas and surface hierarchy with restrained borders and shadows.
- Indigo reserved for selection and primary actions.
- Semantic success, warning, and danger colors used consistently.
- Shared spacing, typography, radius, focus, disabled, hover, and pressed states.
- One visually dominant action per view.
- Labeled icons for important actions; icon-only controls only when conventional and accessible.
- Visible focus states, minimum practical hit targets, and legible contrast in light and dark themes.
- Empty states explain the concept and provide one useful next action.

## Shared Component Foundation

The redesign should introduce renderer-level primitives before rebuilding every screen independently:

- App shell and mode rail
- Page header and primary-action area
- Buttons and icon actions
- Text fields, text areas, and segmented controls
- Menus and dialogs
- Empty-state pattern
- Save, success, warning, and error status
- Toast and undo pattern
- Confirmation dialog
- Tooltip and keyboard-hint pattern
- Focus and screen-reader semantics

The components should remain lightweight and fit the existing React, Tailwind, and CSS-token stack. A large component framework is not required.

## State and Data Flow

The redesign keeps the existing Electron IPC, deck file format, persistence model, settings store, and deck operations.

Recommended renderer state:

- `workspaceMode: 'library' | 'build' | 'rehearse' | 'present'`
- Current deck and active step continue to come from the deck store.
- Creation-dialog, menu, disclosure, and confirmation state stays local to the owning component.
- Rehearsal readiness comes from a pure derived helper, covered by unit tests.

Primary flow:

1. App loads settings and deck summaries.
2. Library creates or opens a deck.
3. Build edits through existing store operations and debounced persistence.
4. Rehearse reads the same deck and computes readiness without mutation.
5. Present uses the existing trusted IPC for compact bounds, always-on-top, clipboard, and live control.
6. Exiting Present returns to Rehearse; closing the deck returns to Library.

## Feedback and Error Handling

- Create, open, save, import, export, and live-control failures must be visible in the surface where they occur.
- Auto-save needs explicit saving, saved, and failed states; a failed save must not look successful.
- Pending edits must be flushed before closing a deck, entering Present, or shutting down the app so the debounce cannot discard the last change.
- Native-dialog cancellation remains a neutral no-op.
- Destructive deck deletion requires confirmation.
- Card, snippet, and variable deletion should provide undo where practical; confirmation is acceptable when undo would be unreliable.
- Duplicate names or invalid variable changes must produce inline guidance rather than silently reverting.
- Rehearsal warnings link to fixes and never masquerade as hard errors.
- Presenter copy feedback remains immediate, visible, and optionally audible.

## Accessibility and Responsive Behavior

- Every workflow must be keyboard-operable without relying on global hotkeys.
- Current shortcuts remain supported and are shown contextually.
- Mode rail, lists, menus, dialogs, tabs, copy actions, and status messages require correct semantics and accessible names.
- Focus moves to newly created content, opened dialogs, and the selected item after destructive actions.
- Dialog focus is trapped and restored.
- The shell must remain usable at the existing 640x480 minimum window and under common OS text scaling or browser zoom.
- Hover-only actions are not permitted.
- Reduced-motion preferences should disable nonessential transitions.

## Verification Strategy

Each implementation issue should include targeted automated coverage for extracted behavior and preserve existing deck operations.

Required end-to-end manual acceptance path:

1. Launch with no decks.
2. Create a demo from the guided flow.
3. Add and reorder steps.
4. Add talking points and paste-ready content.
5. Resolve or intentionally ignore rehearsal warnings.
6. Enter Present, navigate, copy content, and exit.
7. Confirm the prior window state and edited deck are preserved.

Shared completion bar:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

The current Windows baseline has five unrelated CLI test failures around subprocess output and POSIX path expectations. UX issues must not treat those failures as regressions, but any newly affected tests must pass.

## GitHub Backlog

Create one epic and eight focused implementation issues. Child issues should link to the epic and use the `feature`, `ux`, and `agent-task` labels unless their scope is documentation-only.

### Epic: Redesign CueDeck as a guided demo studio

**Goal:** Deliver the Library → Build → Rehearse → Present journey and a coherent professional visual system for non-technical and technical presenters.

**Completion criteria:**

- All eight child issues are complete.
- The complete first-run-to-present acceptance path is usable without documentation.
- Existing deck files, CLI, MCP, live control, and persistence remain compatible.
- Shared validation commands pass apart from documented pre-existing Windows CLI failures.

### 1. Establish the CueDeck Studio design-system foundation

**Scope:**

- Define visual tokens for surfaces, typography, spacing, radii, focus, and semantic states.
- Add shared renderer primitives for buttons, icon actions, fields, menus/dialogs, empty states, status, toast/undo, and tooltips.
- Replace functional emoji with a consistent icon approach.
- Remove or deliberately configure the default Electron application menu and app chrome.
- Preserve light, dark, and system themes.

**Acceptance criteria:**

- Shared components demonstrate consistent states in both themes.
- Focus, disabled, hover, pressed, error, and success states are defined.
- Functional navigation and action icons are no longer emoji.
- The desktop app no longer exposes an irrelevant default Electron menu.
- Existing settings behavior remains compatible.

### 2. Add the Studio shell and Library/Build/Rehearse/Present navigation

**Scope:**

- Introduce the renderer workspace-mode model.
- Add the persistent mode rail and shared page header.
- Define transitions among Library, Build, Rehearse, and Present.
- Keep advanced global actions secondary.
- Support the existing minimum window size.

**Dependencies:** Issue 1.

**Acceptance criteria:**

- The active mode and primary next action are always visible.
- Opening and closing decks transitions predictably between Library and Build.
- Present exits to Rehearse and restores prior window state.
- Navigation is keyboard and screen-reader accessible.
- No deck schema or persisted-data migration is required.

### 3. Redesign the deck Library and first-run creation flow

**Scope:**

- Replace the current picker with a deck Library.
- Add a guided New Demo flow for blank, starter template, and import.
- Improve deck metadata, search/sort readiness, and collection empty states.
- Add discoverable deck menus for open, rename, duplicate, export, and delete.
- Confirm destructive deletion and surface import/export results locally.

**Dependencies:** Issues 1 and 2.

**Acceptance criteria:**

- A first-time user can understand decks, steps, and paste-ready content from the empty state.
- Creating a blank demo lands on a focused first step instead of an inert empty editor.
- Imported demos are visible and can be opened immediately.
- Deck actions do not depend on hover.
- Rename, duplicate, export, and delete provide clear feedback.

### 4. Rebuild authoring as a guided Build workspace

**Scope:**

- Present cue cards as demo steps and snippets as paste-ready content in primary UI.
- Rework the step navigator, editor hierarchy, and primary actions.
- Focus new steps and new content automatically.
- Move variables, Markdown help, live control, and file operations into contextual advanced disclosure.
- Preserve drag reorder, copy, search, variables, Markdown, and auto-save behavior.

**Dependencies:** Issues 1 and 2.

**Acceptance criteria:**

- The core editing sequence is obvious without knowing CueDeck terminology.
- New content is immediately ready for typing.
- Advanced tools remain available without dominating the primary workflow.
- Save status is visible and accurate.
- Existing authoring features and keyboard shortcuts still work.

### 5. Add Rehearse mode and deck-readiness checks

**Scope:**

- Add a read-only full-window rehearsal experience.
- Create a pure readiness evaluator for empty titles, missing variable values, and low-content steps.
- Show a preflight summary with links back to exact Build locations.
- Allow presenting despite warnings.

**Dependencies:** Issues 2 and 4.

**Acceptance criteria:**

- Users can run through every step with rendered notes and paste actions.
- Readiness results are deterministic and covered by unit tests.
- Each warning explains the problem and navigates to a fix.
- Warnings do not mutate the deck or block Present.

### 6. Refine the compact Presenter experience

**Scope:**

- Align Presenter visuals and components with the Studio system.
- Improve sparse-step layout, progress, copy feedback, and previous/next controls.
- Show contextual shortcut hints without clutter.
- Return to Rehearse on exit and preserve window restoration behavior.
- Keep live-control commands compatible.

**Dependencies:** Issues 1, 2, and 5.

**Acceptance criteria:**

- Presenter contains no editing controls.
- Sparse and content-heavy steps both use the compact window well.
- Copy success is unmistakable.
- Mouse, keyboard, and live-control navigation remain consistent.
- Exiting restores prior bounds and always-on-top state.

### 7. Make saving, errors, and destructive actions safe and visible

**Scope:**

- Add explicit saving, saved, and failed states.
- Flush pending edits before deck transitions, Present, and app shutdown.
- Surface create/open/import/export/live-control errors where they occur.
- Add confirmation or undo for deck, step, paste-content, and variable deletion.
- Replace silent invalid-input reversions with inline feedback.
- Add accessible status announcements.

**Dependencies:** Issue 1; coordinate with Issues 3 and 4.

**Acceptance criteria:**

- Failed persistence never appears as saved.
- Closing a deck or app immediately after typing does not lose the last edit.
- Workspace export feedback appears in the workspace.
- No primary content object disappears from one quiet click.
- Undo or confirmation restores a predictable focus target.
- Status changes are perceivable without relying on color alone.

### 8. Complete accessibility and end-to-end workflow quality

**Scope:**

- Audit keyboard order, focus management, semantics, labels, contrast, zoom, minimum size, and reduced motion.
- Add targeted tests for shared navigation and derived workflow behavior.
- Exercise the complete Library → Build → Rehearse → Present → Rehearse journey.
- Update user-facing documentation and screenshots for the redesigned flow.

**Dependencies:** Issues 1 through 7.

**Acceptance criteria:**

- Every primary workflow is usable without a mouse.
- Dialogs, menus, mode navigation, lists, status, and copy actions expose appropriate semantics.
- The app remains usable at 640x480 and common zoom/text-scaling levels.
- Documentation matches the shipped UI and terminology.
- The complete manual acceptance journey passes.

## Recommended Sequence

1. Design-system foundation
2. Studio shell and mode navigation
3. Library and first-run flow
4. Guided Build workspace
5. Rehearse and readiness
6. Presenter refinement
7. Safety and feedback, integrated throughout Issues 3–6
8. Accessibility and end-to-end quality

Issues 3 and 4 can proceed in parallel after Issues 1 and 2. Issue 7 should define shared behavior early, then finish integration after the feature surfaces exist.
