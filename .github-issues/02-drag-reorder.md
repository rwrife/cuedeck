## Summary
Add drag-and-drop reordering for **cue cards** (in the running-order list) and **snippets** (within a card).

## Motivation
Demo scripts get rearranged constantly. Right now cards and snippets are stuck in creation order, which makes iterating on a script painful.

## Requirements
- **Card reordering:** drag a card in `CardList` to a new position; persist the new order.
- **Snippet reordering:** drag a snippet within `CardEditor` to a new position; persist the new order.
- Provide clear drop indicators (insertion line or highlighted slot).
- Reordering must go through the Zustand store and trigger the existing debounced auto-save.
- The snippet **drag handle already emits `text/plain`** for drag-OUT into other apps (see `SnippetButton`). Reorder-drag must not break that external drag behavior — use a distinct handle/affordance or an internal drag type so the two don't conflict.

## Implementation notes
- Prefer a small, well-maintained lib (e.g. `@dnd-kit/core` + `@dnd-kit/sortable`) OR a minimal hand-rolled HTML5 DnD approach. If adding a dependency, add it to `package.json` and justify it in the PR.
- Add store actions: `reorderCards(fromIndex, toIndex)` and `reorderSnippets(cardId, fromIndex, toIndex)`.
- Keep the external drag-out on the snippet handle working; internal sort can use a separate grip or key modifier.

## Acceptance criteria
- [ ] Cards can be reordered by drag; order persists across reload.
- [ ] Snippets can be reordered within a card; order persists.
- [ ] External drag-out of snippet content still works.
- [ ] Unit tests cover `reorderCards` / `reorderSnippets` array logic.
- [ ] `npm run typecheck` and `npm run build` pass.
