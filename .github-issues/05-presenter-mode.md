## Summary
Add a compact, distraction-free **Presenter Mode** optimized for running a live demo, distinct from the full editing workspace.

## Motivation
While demoing, the user doesn't need the editor chrome — they need a small, always-on-top window showing the current card's notes and big copy buttons for its snippets. Editing UI is noise at that moment.

## Requirements
- A toggle (button + hotkey, e.g. `F5` or `Ctrl/Cmd+P`) switches between **Edit** and **Presenter** modes.
- Presenter mode shows:
  - The current card title + talking-point notes (read-only, comfortably readable).
  - Large snippet **Copy** buttons with number labels (`1`–`9`) and drag handles.
  - Prev/next card controls + position indicator (e.g. "3 / 12").
- Presenter mode should auto-enable always-on-top and shrink the window to a compact size; restore previous window bounds on exit.
- No editing controls visible in presenter mode (no delete buttons, no textareas for notes).
- Larger, higher-contrast typography for readability from a distance.

## Implementation notes
- Add a `mode: 'edit' | 'present'` field to the store (UI state).
- Reuse hotkeys/clipboard mechanisms from earlier issues where available.
- Window resize/always-on-top go through main-process IPC; you may add a `window:setPresenter(bool)` handler that sets size + alwaysOnTop and remembers prior bounds.

## Acceptance criteria
- [ ] Toggle switches cleanly between edit and presenter layouts.
- [ ] Presenter mode is compact, always-on-top, read-only, with big copy buttons.
- [ ] Exiting restores the previous window size and on-top state.
- [ ] `npm run typecheck` and `npm run build` pass.
