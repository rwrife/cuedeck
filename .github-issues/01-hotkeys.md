## Summary
Snippets can currently only be copied by clicking the **Copy** button. During a live demo, the user's hands are on the keyboard — add hotkeys so the snippets on the **active card** can be copied with number keys `1`–`9`.

## Motivation
The whole point of CueDeck is friction-free copying mid-demo. Reaching for the mouse breaks flow. Number-key copy is the single highest-value interaction after the app itself.

## Requirements
- When a card is active, pressing `1`–`9` copies the corresponding snippet (by its visible index) to the clipboard via `window.cuedeck.clipboard.write`.
- Show the same **"Copied ✓"** flash on the targeted `SnippetButton` that clicking Copy shows (lift that state so it can be triggered externally, e.g. via a shared store field or an event).
- Ignore the hotkey when the user is typing in an `input`/`textarea` (check `document.activeElement` / event target `tagName` and `isContentEditable`).
- `←` / `→` should move between cards in the running order (previous/next), also disabled while typing in a field.
- Add a small keyboard-hint legend somewhere unobtrusive (e.g. footer of the card editor): `1–9 copy · ← → cards`.

## Implementation notes
- A `useHotkeys` hook in `src/renderer/src/hooks/` attached at the workspace level is a clean approach.
- The active card + its snippets are already in the Zustand store (`activeCardId`, `deck.cards`).
- For the copied-flash, consider adding `lastCopiedSnippetId` to the store and having `SnippetButton` watch it.

## Acceptance criteria
- [ ] Pressing `1`–`9` copies the right snippet and flashes it.
- [ ] Arrow keys change the active card.
- [ ] Hotkeys do nothing while editing text fields.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] A short unit test covers the "which snippet does key N map to" logic.
