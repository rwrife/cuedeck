## Summary
Add a **settings screen** with theme support (dark/light/system) and user-configurable preferences, persisted across launches.

## Motivation
Users demo in different environments and lighting. A light theme, adjustable font size, and a few behavior toggles make the app comfortable for everyone and presentable on shared screens.

## Requirements
- A settings view (modal or dedicated screen) reachable from the deck picker and workspace.
- Preferences:
  - **Theme:** `dark` | `light` | `system` (respire OS preference for `system`).
  - **Presenter font size** (small / medium / large or a slider).
  - **Copy feedback:** toggle the "Copied ✓" flash and/or a subtle sound.
  - **Always-on-top default** for presenter mode (on/off).
- Persist settings via a main-process store (JSON file in `userData`, e.g. `settings.json`) with IPC get/set; do not lose settings on restart.
- Light theme must be a real, legible theme — not just inverted colors. Extend the Tailwind theme tokens accordingly.

## Implementation notes
- Add IPC `settings:get` / `settings:set` handlers + preload API `window.cuedeck.settings`.
- Drive theme via a top-level class (e.g. `data-theme` / `.dark`) and Tailwind's `darkMode: 'class'`; update `tailwind.config.js`.
- Keep a typed `Settings` interface in `shared/`.

## Acceptance criteria
- [ ] Theme switches (dark/light/system) and is legible in both.
- [ ] Font size + toggles work and affect the UI.
- [ ] Settings persist across app restarts.
- [ ] `npm run typecheck` and `npm run build` pass.
