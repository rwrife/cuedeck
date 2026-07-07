## Summary
Let users **export** a deck to a `.json` file anywhere on disk and **import** a deck file back in, using native OS file dialogs.

## Motivation
Decks are currently only in the app's `userData`. Users need to back up, share, and version their demo scripts (e.g. commit them to a repo, send to a teammate).

## Requirements
- **Export:** from the deck picker (and/or workspace top bar), "Export" opens a native save dialog (`dialog.showSaveDialog`) defaulting to `<deckName>.cuedeck.json`, and writes the deck JSON there.
- **Import:** "Import" opens a native open dialog (`dialog.showOpenDialog`, filtered to `.json`), reads the file, validates it, assigns a **new id** (to avoid collisions), saves it into `userData`, and refreshes the deck list.
- Validate imported data against the `Deck` shape; reject malformed files with a friendly error (dialog or inline message).
- Round-trip must be lossless (export then import yields an equivalent deck aside from id/timestamps).

## Implementation notes
- Add IPC handlers `deck:export` and `deck:import` (channels already stubbed in `src/shared/ipc.ts`).
- Use Electron `dialog` in the main process; wire through the preload `window.cuedeck.decks` API.
- Write a small `validateDeck(obj): Deck | null` helper in `shared/` and unit-test it.

## Acceptance criteria
- [ ] Export writes a valid JSON file via native dialog.
- [ ] Import reads, validates, re-ids, and lists the deck.
- [ ] Malformed import is rejected gracefully.
- [ ] `validateDeck` has unit tests (valid + several invalid inputs).
- [ ] `npm run typecheck` and `npm run build` pass.
