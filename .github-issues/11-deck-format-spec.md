## Summary
Define the **canonical CueDeck deck file format** as a versioned JSON document with a published **JSON Schema**, and centralize validation/normalization in a single module used by the app, CLI, and MCP server.

## Motivation
We're about to make decks authorable by AI (CLI + MCP). That only works if there is one unambiguous, documented, machine-checkable format — and one shared validator so the app, CLI, and MCP can't drift. This issue is the foundation the scriptability work (#12–#15) builds on.

## Requirements
- **Single source of truth** for the deck model in `src/shared/`:
  - Keep the existing `Deck` / `CueCard` / `Snippet` TypeScript types authoritative.
  - Add a `validateDeck(input: unknown): { ok: true; deck: Deck } | { ok: false; errors: string[] }` and a `normalizeDeck(input): Deck` (fills defaults, assigns missing ids, sets timestamps, upgrades `schemaVersion`).
  - Export a `createEmptyDeck(name)` factory reused by app + tooling.
- **JSON Schema** published at `schema/cuedeck.schema.json` (Draft 2020-12), matching the TS types. Include `$id`, `title`, `description`, and `schemaVersion` const/enum.
- **File naming/extension:** standardize on `*.cuedeck.json`. Document that the top-level object is a single `Deck`.
- **Docs:** `docs/deck-format.md` describing every field, the id conventions, the variables map (forward-compatible with #7), and a full annotated example deck.
- **Refactor** the app + existing `deckStore` (main) and renderer store to use the shared validator/normalizer where they currently assume shape (e.g. on import/load), without changing runtime behavior for valid decks.
- Do **not** break existing decks: normalization must accept current v1 decks unchanged.

## Implementation notes
- Prefer a tiny, dependency-light validation approach. Either hand-rolled guards in TS (no dep) or a small validator like `ajv` for the JSON Schema path — if you add `ajv`, justify it and keep it out of the renderer bundle if possible (use it in CLI/MCP/main, not the browser).
- Keep the JSON Schema and TS types in lockstep; add a test that asserts a known-good example validates against BOTH the schema and `validateDeck`, and that several malformed inputs fail.
- Consider a `schema/README.md` note on how to regenerate/verify.

## Acceptance criteria
- [ ] `schema/cuedeck.schema.json` exists (Draft 2020-12) and matches the TS model.
- [ ] `validateDeck` / `normalizeDeck` / `createEmptyDeck` live in `shared/` with unit tests (valid + multiple invalid cases, plus an old-deck normalization case).
- [ ] `docs/deck-format.md` documents the format with an annotated example.
- [ ] App import/load path uses the shared validator; existing valid decks still load unchanged.
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass.

Depends on: nothing. Blocks: #14, #15, #16.
