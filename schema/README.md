# CueDeck JSON Schema

`cuedeck.schema.json` is the published, machine-checkable definition of the
CueDeck deck file format (JSON Schema **Draft 2020-12**). The top-level object
is a single [`Deck`](../src/shared/types.ts).

## Source of truth

The **authoritative** model is the TypeScript in `src/shared/`:

- `src/shared/types.ts` — the `Deck` / `CueCard` / `Snippet` types.
- `src/shared/deck.ts` — the shared runtime validator/normalizer
  (`validateDeck`, `normalizeDeck`, `createEmptyDeck`).

This JSON Schema is kept **in lockstep** with those types by hand. When you
change the model:

1. Update the TS types in `src/shared/types.ts`.
2. Update the guards in `src/shared/deck.ts`.
3. Update this schema to match (fields, `required`, `additionalProperties`,
   and the `schemaVersion` `const`/`enum`).
4. Bump `CURRENT_SCHEMA_VERSION` (and extend `SUPPORTED_SCHEMA_VERSIONS`) if the
   change is not backward compatible.

## Verify

A unit test asserts that a known-good example deck validates against **both**
this JSON Schema (via `ajv`) and the hand-rolled `validateDeck`, and that
several malformed inputs fail. Run:

```bash
npm run test
```

`ajv` is a **dev/test/CLI-only** dependency — it is never imported by the
renderer (browser) bundle. The app's runtime validation uses the
dependency-light guards in `src/shared/deck.ts`.

You can also validate a deck file manually with any Draft 2020-12 validator,
e.g. [`ajv-cli`](https://github.com/ajv-validator/ajv-cli):

```bash
npx ajv-cli validate -s schema/cuedeck.schema.json -d path/to/deck.cuedeck.json --spec=draft2020
```
