# CueDeck Deck File Format

This document is the human-readable specification of the **CueDeck deck file
format**. The machine-checkable version is the JSON Schema at
[`schema/cuedeck.schema.json`](../schema/cuedeck.schema.json) (JSON Schema
**Draft 2020-12**), and the runtime source of truth is the TypeScript in
[`src/shared/`](../src/shared).

- **Authoritative types:** [`src/shared/types.ts`](../src/shared/types.ts)
- **Shared validator/normalizer:** [`src/shared/deck.ts`](../src/shared/deck.ts)
  (`validateDeck`, `normalizeDeck`, `createEmptyDeck`)
- **Published schema:** [`schema/cuedeck.schema.json`](../schema/cuedeck.schema.json)

The app (Electron main + renderer), the CLI, and the MCP server all import the
**same** validator/normalizer so the format can never drift between them.

---

## File naming & extension

- A deck is persisted as a **single JSON file** whose top-level object is one
  `Deck`.
- The canonical extension is **`.cuedeck.json`** (e.g. `product-launch.cuedeck.json`).
  This double extension keeps files recognizable as CueDeck decks while staying
  valid, editor-friendly JSON.
- Inside the app's storage (`<userData>/decks/`) decks are named `<id>.json`
  for stability; user-facing **export/import** uses the `.cuedeck.json`
  convention (default export filename is `<deckName>.cuedeck.json`).
- Encoding is UTF-8. Files are pretty-printed with 2-space indentation when
  written by the app.

The extension constant is exported as `DECK_FILE_EXTENSION` from
`src/shared/types.ts`.

---

## Top-level object: `Deck`

| Field           | Type                     | Required | Description |
| --------------- | ------------------------ | :------: | ----------- |
| `id`            | `string` (non-empty)     |   yes    | Stable unique id for the deck. UUID v4 in practice. |
| `name`          | `string`                 |   yes    | Human-friendly deck name shown in the picker. May be empty but must be present. |
| `cards`         | `CueCard[]`              |   yes    | Ordered list of cue cards. **Array order is the demo running order.** |
| `createdAt`     | `string` (ISO 8601)      |   yes    | Timestamp of creation. |
| `updatedAt`     | `string` (ISO 8601)      |   yes    | Timestamp of last modification. Updated on every save. |
| `schemaVersion` | `integer`                |   yes    | Deck format version. Currently **`1`**. Used for forward migrations. |
| `variables`     | `Record<string,string>`  |    no    | Optional named variables (see [Variables](#variables-forward-compatible)). Omitted entirely when unused. |

`additionalProperties` is **not** allowed at any level: unknown fields cause
validation to fail, which keeps the format tight and catches typos early.

### `CueCard`

One step/beat in a demo.

| Field      | Type                 | Required | Description |
| ---------- | -------------------- | :------: | ----------- |
| `id`       | `string` (non-empty) |   yes    | Stable unique id, **unique within the deck**. |
| `title`    | `string`             |   yes    | Card title / beat name. |
| `notes`    | `string`             |   yes    | Freeform talking points / script. Plain text, markdown-friendly. |
| `snippets` | `Snippet[]`          |   yes    | Snippets attached to this card (may be empty). |

### `Snippet`

A labeled blob of text the user copies or drags into the demo target app.

| Field     | Type                 | Required | Description |
| --------- | -------------------- | :------: | ----------- |
| `id`      | `string` (non-empty) |   yes    | Stable unique id, **unique within its card**. |
| `label`   | `string`             |   yes    | Short label shown on the copy button, e.g. `"Test email"`. |
| `content` | `string`             |   yes    | The actual text placed on the clipboard / dragged out. |

---

## Id conventions

- Every `id` (deck, card, snippet) is a **non-empty string**. The app generates
  **UUID v4** ids via `crypto.randomUUID()`; the shared `generateId()` helper is
  used everywhere so all producers behave identically.
- Ids must be **unique within their scope**: card ids are unique within a deck,
  snippet ids are unique within a card. (Globally-unique UUIDs satisfy this
  trivially.)
- Ids are **stable**: they are not regenerated on save. The one deliberate
  exception is **import**, which assigns a fresh deck `id` to avoid collisions
  with a deck already in storage.
- Missing ids are **filled in by `normalizeDeck`** rather than rejected, so
  hand-authored or AI-authored decks that omit ids become valid automatically.

---

## Timestamps

- `createdAt` / `updatedAt` are ISO 8601 date-time strings
  (`new Date().toISOString()`), e.g. `2026-07-07T13:10:00.000Z`.
- `updatedAt` is refreshed by the app on every save.
- `normalizeDeck` fills either timestamp with "now" when it is missing or
  unparseable, but leaves valid timestamps untouched.

---

## Schema version & migrations

- `schemaVersion` is currently **`1`** (`CURRENT_SCHEMA_VERSION`).
- `SUPPORTED_SCHEMA_VERSIONS` lists every version this build can read.
- `normalizeDeck` **upgrades** a deck to `CURRENT_SCHEMA_VERSION`. Today that is
  a no-op for v1 decks; future versions will add migration logic here.
- **Backward compatibility guarantee:** a well-formed current-version deck is
  returned **byte-identical** by `normalizeDeck` (same keys, same values,
  `variables` still omitted when it was absent). Existing decks never change on
  load.

---

## Variables (forward-compatible)

`variables` is an **optional** flat map of `string → string`, reserved for
snippet variable substitution (issue #7). The intended future semantics: snippet
`content` may contain `{{key}}` tokens that resolve against this map at
copy time.

- When a deck does not use variables, the field is **omitted entirely** (not
  `{}`), so v1 decks round-trip unchanged.
- When present, every value must be a string. `normalizeDeck` drops non-string
  values defensively.
- Declaring the field now means older builds and tooling already know the shape,
  so #7 can land without another format break.

```jsonc
{
  // ...
  "variables": {
    "demoUser": "ada@example.com",
    "orgName": "Acme, Inc."
  }
}
```

---

## Full annotated example

> JSONC comments below are for documentation only — real `.cuedeck.json` files
> are plain JSON and must not contain comments.

```jsonc
{
  // Stable deck id (UUID v4). Generated once, never rewritten on save.
  "id": "0f8a2c1e-4b7d-4a2f-9c31-2d5e6f7a8b90",

  // Human-friendly name shown in the deck picker.
  "name": "Product Launch Demo",

  // Cue cards in running order — top to bottom is the order you present.
  "cards": [
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000001",
      "title": "Intro & sign-in",
      "notes": "Welcome the audience. Sign in with the demo account.\nKeep it under 30 seconds.",
      "snippets": [
        {
          "id": "s1a2b3c4-0001-4000-8000-000000000001",
          "label": "Demo email",
          "content": "ada@example.com"
        },
        {
          "id": "s1a2b3c4-0001-4000-8000-000000000002",
          "label": "Demo password",
          "content": "hunter2-demo"
        }
      ]
    },
    {
      "id": "a1b2c3d4-0002-4000-8000-000000000002",
      "title": "Create a project",
      "notes": "Show the empty state, then create 'Acme Rollout'.",
      "snippets": [
        {
          "id": "s1a2b3c4-0002-4000-8000-000000000001",
          "label": "Project name",
          "content": "Acme Rollout"
        }
      ]
    },
    {
      // A card can legitimately have zero snippets — it's just talking points.
      "id": "a1b2c3d4-0003-4000-8000-000000000003",
      "title": "Wrap up",
      "notes": "Recap the three headline features. Invite questions.",
      "snippets": []
    }
  ],

  // ISO 8601 timestamps.
  "createdAt": "2026-07-07T12:00:00.000Z",
  "updatedAt": "2026-07-07T13:10:00.000Z",

  // Deck format version.
  "schemaVersion": 1

  // "variables" is omitted here because this deck doesn't use them.
}
```

---

## Validating a deck

**In code (app / CLI / MCP):**

```ts
import { validateDeck, normalizeDeck, createEmptyDeck } from '@shared/deck'

const result = validateDeck(parsedJson)
if (result.ok) {
  // result.deck is a fully-typed Deck
} else {
  // result.errors is a string[] of human-readable problems
}

// Coerce loose/partial input (fills ids, defaults, timestamps, version):
const deck = normalizeDeck(parsedJson)

// Make a new empty deck:
const empty = createEmptyDeck('My Demo')
```

`validateDeck` returns:

```ts
{ ok: true; deck: Deck } | { ok: false; errors: string[] }
```

**On the command line** with any Draft 2020-12 validator:

```bash
npx ajv-cli validate -s schema/cuedeck.schema.json -d my-deck.cuedeck.json --spec=draft2020
```
