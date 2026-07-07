## Summary
Add a **search / command palette** (triggered by `/` or `Ctrl/Cmd+K`) to quickly jump to any card or copy any snippet across the whole deck.

## Motivation
Long decks (30+ cards) are slow to navigate by clicking. During a demo, being able to type a few letters and copy the right snippet is a huge speedup.

## Requirements
- A modal palette overlay, opened by `/` (when not typing in a field) or `Ctrl/Cmd+K`.
- Fuzzy-search across **card titles**, **card notes**, and **snippet labels/content**.
- Results grouped or clearly labeled as "Card" vs "Snippet".
- **Enter** on a card result → activate that card. **Enter** on a snippet result → copy it to clipboard (with the copied flash) and close.
- Arrow keys move the selection; `Esc` closes.
- Fully keyboard-operable; no mouse required.

## Implementation notes
- A lightweight fuzzy match is fine (substring + simple scoring), or add a tiny lib like `fuse.js` (justify in PR if added).
- Reuse the clipboard write + copied-flash mechanism from the hotkeys issue if present; otherwise call `window.cuedeck.clipboard.write` directly.
- Component: `src/renderer/src/components/CommandPalette.tsx`, mounted in `DeckWorkspace`.

## Acceptance criteria
- [ ] `/` and `Ctrl/Cmd+K` open the palette (not while typing in a field for `/`).
- [ ] Searching matches cards and snippets; results are labeled.
- [ ] Enter activates a card or copies a snippet appropriately.
- [ ] Keyboard navigation + `Esc` work.
- [ ] `npm run typecheck` and `npm run build` pass.
