# CueDeck UX Backlog Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved CueDeck Studio UX redesign as one GitHub epic and eight linked, sequenced implementation issues.

**Architecture:** The design specification remains the source of truth. Create the epic first, create each focused issue with self-contained scope and acceptance criteria, then update the epic with a linked checklist and verify titles, labels, dependencies, and cross-references through the GitHub CLI.

**Tech Stack:** GitHub Issues, GitHub CLI (`gh`), PowerShell, Markdown

---

## File and Resource Map

- Reference: `docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
- Create: GitHub epic in `rwrife/cuedeck`
- Create: Eight GitHub child issues in `rwrife/cuedeck`
- Modify: Epic body after child issue numbers are known
- Modify: No application source files

## Shared PowerShell Helpers

Run all commands from:

```powershell
Set-Location 'C:\Users\ryrife\.config\superpowers\worktrees\cuedeck\ux-refinement-backlog'
$repo = 'rwrife/cuedeck'
```

Use this helper for every issue:

```powershell
function New-CueDeckIssue {
  param(
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][string]$Body,
    [Parameter(Mandatory)][string[]]$Labels
  )

  $arguments = @(
    'issue', 'create',
    '--repo', $repo,
    '--title', $Title,
    '--body', $Body
  )

  foreach ($label in $Labels) {
    $arguments += @('--label', $label)
  }

  $url = (& gh @arguments).Trim()
  $numberMatch = [regex]::Match($url, '/issues/(\d+)$')
  if ($LASTEXITCODE -ne 0 -or -not $numberMatch.Success) {
    throw "Could not create issue: $Title"
  }

  return [int]$numberMatch.Groups[1].Value
}
```

## Task 1: Verify Repository and Duplicate State

- [ ] **Step 1: Verify GitHub authentication and repository access**

Run:

```powershell
gh auth status
gh repo view $repo --json nameWithOwner,url --jq '{nameWithOwner,url}'
```

Expected: Authentication succeeds and the repository is reported as `rwrife/cuedeck`.

- [ ] **Step 2: Verify required labels exist**

Run:

```powershell
gh label list --repo $repo --limit 100 --json name --jq '.[].name'
```

Expected: Output contains `feature`, `ux`, and `agent-task`.

- [ ] **Step 3: Search for duplicate redesign issues**

Run:

```powershell
gh issue list `
  --repo $repo `
  --state all `
  --search '"CueDeck Studio" in:title' `
  --limit 50 `
  --json number,title,state,url
```

Expected: No existing issue covers the approved CueDeck Studio redesign. If an exact duplicate exists, stop instead of creating another issue.

## Task 2: Create the UX Redesign Epic

- [ ] **Step 1: Define the epic body**

```powershell
$epicBody = @"
## Summary

Redesign CueDeck as a guided, professional demo studio organized around four clear user tasks:

1. **Library** — find or start a demo.
2. **Build** — plan the story and prepare paste-ready content.
3. **Rehearse** — check readiness and practice the run.
4. **Present** — deliver the demo from a focused compact surface.

## Motivation

CueDeck's features work, but the current desktop experience exposes them as a collection of controls. First-time users receive little guidance, advanced features compete with core authoring actions, destructive actions are too quiet, and there is no explicit rehearsal/readiness step.

The redesigned flow should be immediately approachable to any presenter, including non-technical users, while preserving CLI, MCP, live control, variables, Markdown, import/export, hotkeys, and deck-file compatibility.

## Goals

- Establish a coherent Studio shell and visual system.
- Make the complete first-run-to-present journey understandable without documentation.
- Progressively disclose technical and infrequent features.
- Add a real Rehearse mode with actionable readiness checks.
- Make saving, errors, and destructive actions visible and safe.
- Preserve the existing deck schema, Electron IPC, persistence, CLI, MCP, and live-control contracts.

## Completion criteria

- [ ] All linked implementation issues are complete.
- [ ] A user can complete Library → Build → Rehearse → Present → Rehearse without documentation.
- [ ] Existing deck files and automation surfaces remain compatible.
- [ ] The app is keyboard-operable and usable at its supported minimum window size.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` meet the repository completion bar, apart from the separately documented pre-existing Windows CLI baseline failures.

## Design

See `docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`.
"@
```

- [ ] **Step 2: Create the epic**

Run:

```powershell
$epicNumber = New-CueDeckIssue `
  -Title 'Epic: Redesign CueDeck as a guided demo studio' `
  -Body $epicBody `
  -Labels @('feature', 'ux')

Write-Output "EPIC=$epicNumber"
```

Expected: A new issue URL is returned and `$epicNumber` contains its numeric issue ID.

## Task 3: Create the Design-System Foundation Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue1Body = @"
Part of #$epicNumber.

## Summary

Establish the shared visual and interaction foundation for CueDeck Studio before rebuilding individual screens.

## Scope

- Define tokens for surfaces, typography, spacing, radii, focus, and semantic status colors.
- Add lightweight shared renderer primitives for buttons, icon actions, fields, segmented controls, menus, dialogs, empty states, status, toast/undo, confirmations, and tooltips.
- Replace functional emoji with one consistent accessible icon approach.
- Remove or deliberately configure the default Electron application menu and app chrome.
- Preserve dark, light, and system themes.
- Respect reduced-motion preferences.

## Acceptance criteria

- [ ] Shared components have consistent default, hover, pressed, focus, disabled, success, warning, and error states.
- [ ] Components are legible in dark and light themes.
- [ ] Functional navigation and action icons are not emoji.
- [ ] Important icon actions have accessible names and practical hit targets.
- [ ] The desktop app no longer exposes an irrelevant default Electron menu.
- [ ] Existing theme and settings behavior remains compatible.
- [ ] Targeted tests cover extracted state or behavior.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue1Number = New-CueDeckIssue `
  -Title 'Establish the CueDeck Studio design-system foundation' `
  -Body $issue1Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue1Number` contains the new issue number.

## Task 4: Create the Studio Shell Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue2Body = @"
Part of #$epicNumber.

Depends on #$issue1Number.

## Summary

Add the CueDeck Studio shell and explicit Library, Build, Rehearse, and Present workspace modes.

## Scope

- Introduce renderer workspace state for `library`, `build`, `rehearse`, and `present`.
- Add a persistent accessible mode rail and shared page header.
- Keep Library available at all times; disable deck-specific modes until a deck is open.
- Define predictable transitions among opening, closing, building, rehearsing, presenting, and exiting Present.
- Keep advanced global actions secondary.
- Support the existing 640x480 minimum window.
- Preserve existing deck persistence and window-state IPC.

## Acceptance criteria

- [ ] The active mode and one primary next action are always clear.
- [ ] Opening a deck moves from Library to Build.
- [ ] Closing a deck returns to Library.
- [ ] Present exits to Rehearse and restores prior bounds and always-on-top state.
- [ ] Mode navigation is fully keyboard-operable and screen-reader labeled.
- [ ] The shell remains usable at 640x480 and common zoom/text-scaling levels.
- [ ] No deck schema or persisted-data migration is introduced.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue2Number = New-CueDeckIssue `
  -Title 'Add Studio shell and Library/Build/Rehearse/Present navigation' `
  -Body $issue2Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue2Number` contains the new issue number.

## Task 5: Create the Library and First-Run Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue3Body = @"
Part of #$epicNumber.

Depends on #$issue1Number and #$issue2Number.

## Summary

Replace the current deck picker with a welcoming Library and guided first-run creation flow.

## Scope

- Show decks with useful metadata and room for search and sorting.
- Add a guided New Demo flow for a blank demo, starter template, or import.
- Teach decks, steps, and paste-ready content in the first-run empty state.
- Add discoverable deck menus for open, rename, duplicate, export, and delete.
- Confirm deck deletion and surface import/export results in the Library.
- Open a newly created blank demo with a focused first step.
- Make imported demos immediately discoverable and openable.

## Acceptance criteria

- [ ] A first-time user can understand CueDeck's core concepts without reading documentation.
- [ ] Creating a blank demo lands on a focused first step instead of an inert empty editor.
- [ ] Starter-template and import choices explain what will happen.
- [ ] Deck actions do not depend on hover.
- [ ] Rename, duplicate, export, and delete provide visible success or error feedback.
- [ ] Delete requires confirmation and restores focus predictably.
- [ ] Existing deck files remain compatible.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue3Number = New-CueDeckIssue `
  -Title 'Redesign the deck Library and first-run creation flow' `
  -Body $issue3Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue3Number` contains the new issue number.

## Task 6: Create the Guided Build Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue4Body = @"
Part of #$epicNumber.

Depends on #$issue1Number and #$issue2Number.

## Summary

Rebuild authoring as a guided Build workspace that uses presenter-friendly language and progressively discloses advanced tools.

## Scope

- Present cue cards as demo steps and snippets as paste-ready content in primary UI.
- Rework the running-order navigator, editor hierarchy, and primary actions.
- Focus newly created steps and paste-ready content immediately.
- Move variables, Markdown help, live control, and file operations into contextual advanced disclosure.
- Keep drag reorder, copy, search, variables, Markdown, hotkeys, and auto-save behavior.
- Provide a clear Rehearse next action.

## Acceptance criteria

- [ ] The core editing sequence is understandable without knowing CueDeck terminology.
- [ ] New steps and paste-ready content are immediately ready for typing.
- [ ] Advanced tools remain available without competing with the primary workflow.
- [ ] Reordering, search, copy, variables, Markdown, and existing hotkeys still work.
- [ ] Save status is visible and accurate.
- [ ] Empty states explain the concept and provide one useful next action.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue4Number = New-CueDeckIssue `
  -Title 'Rebuild authoring as a guided Build workspace' `
  -Body $issue4Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue4Number` contains the new issue number.

## Task 7: Create the Rehearse and Readiness Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue5Body = @"
Part of #$epicNumber.

Depends on #$issue2Number and #$issue4Number.

## Summary

Add a read-only Rehearse mode with deterministic deck-readiness checks before entering the compact Presenter surface.

## Scope

- Add a full-window rehearsal run-through using rendered talking points and real navigation.
- Create a pure readiness evaluator for empty titles, missing variable values, and low-content steps.
- Show a preflight summary with links to the exact Build locations that resolve warnings.
- Allow users to start Present despite warnings.
- Keep readiness derived; do not persist it in deck files.

## Acceptance criteria

- [ ] Users can rehearse every step with rendered notes and paste actions.
- [ ] Readiness results are deterministic and covered by unit tests.
- [ ] Each warning explains the concern and links to a specific fix.
- [ ] Warnings do not mutate the deck.
- [ ] Warnings inform rather than block Present.
- [ ] Rehearse exposes one clear Start Presenting action.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue5Number = New-CueDeckIssue `
  -Title 'Add Rehearse mode and deck-readiness checks' `
  -Body $issue5Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue5Number` contains the new issue number.

## Task 8: Create the Presenter Refinement Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue6Body = @"
Part of #$epicNumber.

Depends on #$issue1Number, #$issue2Number, and #$issue5Number.

## Summary

Refine Presenter Mode into a polished, compact delivery surface aligned with the CueDeck Studio system.

## Scope

- Align Presenter visuals and components with the shared design system.
- Improve sparse-step layout, progress, copy feedback, and previous/next controls.
- Show contextual shortcut hints without requiring shortcut knowledge.
- Return to Rehearse on exit.
- Preserve compact sizing, always-on-top behavior, clipboard actions, and live-control compatibility.

## Acceptance criteria

- [ ] Presenter contains no editing controls.
- [ ] Sparse and content-heavy steps both use the compact window effectively.
- [ ] Copy success is unmistakable and does not rely on color alone.
- [ ] Mouse, keyboard, and live-control navigation remain consistent.
- [ ] Exiting restores prior bounds and always-on-top state and returns to Rehearse.
- [ ] Existing copy-sound and copy-flash preferences still work.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue6Number = New-CueDeckIssue `
  -Title 'Refine the compact Presenter experience' `
  -Body $issue6Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue6Number` contains the new issue number.

## Task 9: Create the Safety and Feedback Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue7Body = @"
Part of #$epicNumber.

Depends on #$issue1Number and coordinates with #$issue3Number and #$issue4Number.

## Summary

Make persistence, errors, and destructive actions explicit and safe throughout CueDeck Studio.

## Scope

- Add accurate saving, saved, and failed states.
- Flush pending edits before closing a deck, entering Present, or shutting down the app.
- Surface create, open, save, import, export, and live-control errors where they occur.
- Add confirmation or undo for deck, step, paste-content, and variable deletion.
- Replace silent invalid-input reversions with inline guidance.
- Add accessible status announcements.

## Acceptance criteria

- [ ] Failed persistence never appears as saved.
- [ ] Closing a deck or app immediately after typing does not lose the last edit.
- [ ] Workspace export success or failure appears in the workspace.
- [ ] No primary content object disappears from one quiet click.
- [ ] Undo or confirmation restores a predictable focus target.
- [ ] Invalid variable names or collisions produce visible guidance.
- [ ] Status changes are perceivable without relying on color alone.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue7Number = New-CueDeckIssue `
  -Title 'Make saving, errors, and destructive actions safe and visible' `
  -Body $issue7Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue7Number` contains the new issue number.

## Task 10: Create the Accessibility and Workflow Quality Issue

- [ ] **Step 1: Define the issue body**

```powershell
$issue8Body = @"
Part of #$epicNumber.

Depends on #$issue1Number, #$issue2Number, #$issue3Number, #$issue4Number, #$issue5Number, #$issue6Number, and #$issue7Number.

## Summary

Complete an accessibility, responsive-behavior, documentation, and end-to-end workflow quality pass after the Studio surfaces are integrated.

## Scope

- Audit keyboard order, focus management, semantics, labels, contrast, zoom, minimum size, and reduced motion.
- Add targeted tests for shared navigation and derived workflow behavior.
- Exercise the complete Library → Build → Rehearse → Present → Rehearse journey.
- Update user-facing documentation and screenshots for the redesigned flow.

## Acceptance criteria

- [ ] Every primary workflow is usable without a mouse.
- [ ] Dialogs, menus, mode navigation, lists, status, and copy actions expose appropriate semantics.
- [ ] Focus is trapped and restored correctly for dialogs and menus.
- [ ] The app remains usable at 640x480 and common zoom/text-scaling levels.
- [ ] Reduced-motion preferences disable nonessential transitions.
- [ ] Documentation and screenshots match the shipped UI and terminology.
- [ ] The complete first-launch-to-present manual acceptance journey passes.
- [ ] Repository typecheck, lint, tests, and build meet the completion bar.

## Design reference

`docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`
"@
```

- [ ] **Step 2: Create the issue**

```powershell
$issue8Number = New-CueDeckIssue `
  -Title 'Complete accessibility and end-to-end workflow quality' `
  -Body $issue8Body `
  -Labels @('feature', 'ux', 'agent-task')
```

Expected: `$issue8Number` contains the new issue number.

## Task 11: Link the Epic and Verify the Published Backlog

- [ ] **Step 1: Replace the epic body with the linked issue checklist**

```powershell
$epicBodyFinal = @"
## Summary

Redesign CueDeck as a guided, professional demo studio organized around four clear user tasks:

1. **Library** — find or start a demo.
2. **Build** — plan the story and prepare paste-ready content.
3. **Rehearse** — check readiness and practice the run.
4. **Present** — deliver the demo from a focused compact surface.

## Motivation

CueDeck's features work, but the current desktop experience exposes them as a collection of controls. First-time users receive little guidance, advanced features compete with core authoring actions, destructive actions are too quiet, and there is no explicit rehearsal/readiness step.

The redesigned flow should be immediately approachable to any presenter, including non-technical users, while preserving CLI, MCP, live control, variables, Markdown, import/export, hotkeys, and deck-file compatibility.

## Implementation issues

- [ ] #$issue1Number
- [ ] #$issue2Number
- [ ] #$issue3Number
- [ ] #$issue4Number
- [ ] #$issue5Number
- [ ] #$issue6Number
- [ ] #$issue7Number
- [ ] #$issue8Number

## Recommended sequence

1. #$issue1Number — design-system foundation
2. #$issue2Number — Studio shell and mode navigation
3. #$issue3Number and #$issue4Number — Library and Build can proceed in parallel
4. #$issue5Number — Rehearse and readiness
5. #$issue6Number — Presenter refinement
6. #$issue7Number — shared safety behavior should begin early and complete after Library/Build integration
7. #$issue8Number — final accessibility and end-to-end quality pass

## Completion criteria

- [ ] All linked implementation issues are complete.
- [ ] A user can complete Library → Build → Rehearse → Present → Rehearse without documentation.
- [ ] Existing deck files and automation surfaces remain compatible.
- [ ] The app is keyboard-operable and usable at its supported minimum window size.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` meet the repository completion bar, apart from the separately documented pre-existing Windows CLI baseline failures.

## Design

See `docs/superpowers/specs/2026-07-14-cuedeck-studio-ux-redesign-design.md`.
"@

gh issue edit $epicNumber --repo $repo --body $epicBodyFinal
```

Expected: The epic body contains links to all eight child issues and the implementation sequence.

- [ ] **Step 2: Verify the epic**

Run:

```powershell
gh issue view $epicNumber `
  --repo $repo `
  --json number,title,state,labels,body,url `
  --jq '{number,title,state,labels:[.labels[].name],url,body}'
```

Expected:

- Title is `Epic: Redesign CueDeck as a guided demo studio`.
- Labels are `feature` and `ux`.
- Body contains all eight generated issue-number links.

- [ ] **Step 3: Verify all child issues**

Run:

```powershell
$expectedNumbers = @(
  $issue1Number,
  $issue2Number,
  $issue3Number,
  $issue4Number,
  $issue5Number,
  $issue6Number,
  $issue7Number,
  $issue8Number
)

foreach ($number in $expectedNumbers) {
  $jq = '{number,title,state,labels:[.labels[].name],url,hasEpicLink:(.body | contains("Part of #' + $epicNumber + '."))}'
  gh issue view $number `
    --repo $repo `
    --json number,title,state,labels,body,url `
    --jq $jq
}
```

Expected: Eight open issues are returned; each has `feature`, `ux`, and `agent-task`, and `hasEpicLink` is `true`.

- [ ] **Step 4: Confirm the backlog count**

Run:

```powershell
gh issue list `
  --repo $repo `
  --state open `
  --label ux `
  --limit 50 `
  --json number,title,url `
  --jq '.[] | select(.title | contains("guided demo studio") or contains("CueDeck Studio") or contains("Studio shell") or contains("deck Library") or contains("guided Build") or contains("Rehearse mode") or contains("Presenter experience") or contains("destructive actions") or contains("accessibility"))'
```

Expected: One epic and eight focused UX issues are visible.
