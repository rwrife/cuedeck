# CueDeck CLI (`cuedeck`)

The **`cuedeck`** command is a headless CLI for scripting decks — create and
edit decks, cards, snippets, and variables; validate, import, and export deck
files; and render a plain-text running order — all **without launching the
Electron app**. It's the non-GUI entry point that makes decks fully scriptable
from any shell, from CI, or from an AI agent, and it's the layer the
[MCP server](../src/shared) wraps.

It reads and writes the **same on-disk deck store** the desktop app uses, so a
deck you author in a terminal shows up in the GUI and vice-versa.

- **Source:** [`src/cli/`](../src/cli)
- **Shared deck core (validation/normalization/substitution):**
  [`src/shared/`](../src/shared) — the CLI never re-implements deck logic.
- **File format:** [`docs/deck-format.md`](deck-format.md)

---

## Install / build

The CLI is bundled by the project's build step into `out/cli/index.js`, which is
registered as the `cuedeck` bin in `package.json`.

```bash
npm install
npm run build        # builds the app AND the CLI (out/cli/index.js)
# or just the CLI:
npm run build:cli
```

Run it any of these ways:

```bash
node ./out/cli/index.js <command> …     # direct
npx cuedeck <command> …                  # via the package bin (after build)
npm run cli -- <command> …               # rebuilds the CLI, then runs it
```

> The CLI is built with a small dedicated **esbuild** step
> ([`scripts/build-cli.mjs`](../scripts/build-cli.mjs)) because `electron-vite`
> only builds the app's main/preload/renderer bundles. esbuild is already part of
> the toolchain, so no heavy new dependency is added; the output is a single,
> self-contained ESM file with a `#!/usr/bin/env node` shebang.

---

## Where decks are stored

By default the CLI reads/writes the app's real per-user deck directory —
Electron's `userData/decks`, resolved **without booting Electron** by replicating
Electron's own path rules:

| OS | Deck directory |
| --- | --- |
| **Windows** | `%APPDATA%\cuedeck\decks\` |
| **macOS** | `~/Library/Application Support/cuedeck/decks/` |
| **Linux** | `~/.config/cuedeck/decks/` (honors `$XDG_CONFIG_HOME`) |

These are exactly the paths in the app's [Data Storage](../README.md#data-storage)
section, so the CLI and GUI share one store.

**Override the directory** (for headless runs, CI, or a throwaway store), in
priority order:

1. `--dir <path>` flag (highest priority)
2. `CUEDECK_DIR` environment variable
3. the default `userData/decks` path

```bash
cuedeck --dir ./my-decks list
CUEDECK_DIR=./my-decks cuedeck list
```

An override points **directly at the decks directory** (deck files live inside
it). Resolution logic: [`src/cli/deckDir.ts`](../src/cli/deckDir.ts).

---

## Exit codes

Consistent across every command, so scripts and agents can branch on them:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime / validation failure (deck not found, invalid file, …) |
| `2` | Usage error (unknown command, missing required argument) |

Human output and machine (`--json`) output go to **stdout**; diagnostics and
error messages go to **stderr**.

---

## Commands

In the examples below, `$DECK` / `$CARD` are ids printed by earlier commands.

### `cuedeck list [--json]`

List decks: id, card count, `updatedAt`, and name (newest first). `--json` prints
an array of deck summaries for machine consumption.

```bash
cuedeck list
# 6f1c…  3 cards  2026-07-07T18:00:00.000Z  Product Launch

cuedeck list --json
# [ { "id": "6f1c…", "name": "Product Launch", "filePath": "…", "cardCount": 3, "updatedAt": "…" } ]
```

### `cuedeck create <name>`

Create a new (empty) deck and print its id.

```bash
DECK=$(cuedeck create "Product Launch")
```

### `cuedeck show <deckId> [--json]`

Human-readable summary of a deck; with `--json`, prints the **full deck**
document.

```bash
cuedeck show "$DECK"
# Name:      Product Launch
# Id:        6f1c…
# Cards:     3
# Snippets:  7
# Variables: 2
# Updated:   2026-07-07T18:00:00.000Z
# Version:   2

cuedeck show "$DECK" --json > deck.json
```

Exits `1` if the deck id doesn't exist.

### `cuedeck add-card <deckId> --title <t> [--notes <n>]`

Append a cue card and print its id. `--notes` is optional and accepts the same
safe-subset Markdown the app renders.

```bash
CARD=$(cuedeck add-card "$DECK" --title "Kickoff" --notes "Welcome the audience")
```

### `cuedeck add-snippet <deckId> <cardId> --label <l> --content <c|->`

Append a snippet to a card and print its id. Pass `--content -` (or a bare `-`)
to read the snippet body from **stdin** — handy for multi-line content or piping
from a file.

```bash
cuedeck add-snippet "$DECK" "$CARD" --label "Greeting" --content "Hi {{name}}, welcome!"

# multi-line content from stdin:
printf 'line one\nline two\n' | cuedeck add-snippet "$DECK" "$CARD" --label "Body" --content -

# from a file:
cuedeck add-snippet "$DECK" "$CARD" --label "SQL" --content - < query.sql
```

Snippet content may reference `{{variable}}` placeholders (see `set-var` and
`render`).

### `cuedeck set-var <deckId> <name> <value>`

Set a deck-level variable used for `{{placeholder}}` substitution in snippet
content (forward-compatible with the app's variables feature).

```bash
cuedeck set-var "$DECK" name "Ada"
```

### `cuedeck import <file.cuedeck.json>`

Validate and import a deck file. The imported deck is assigned a **fresh id** (so
it never collides with an existing deck) and persisted; its new id is printed.
Exits `1` with the validation errors if the file isn't a valid deck.

```bash
NEW=$(cuedeck import ./shared-deck.cuedeck.json)
```

### `cuedeck export <deckId> [--out <file>]`

Write a deck's JSON. With `--out`, writes to that file (a confirmation goes to
stderr); without it, prints the deck JSON to **stdout** (pipe-friendly).

```bash
cuedeck export "$DECK" --out ./product-launch.cuedeck.json
cuedeck export "$DECK" > backup.json
```

### `cuedeck validate <file|deckId>`

Run the shared `validateDeck` against either a **file on disk** or an existing
**deck id** in the store. Prints a one-line OK on success; on failure it lists
every problem and exits **nonzero** — ideal for CI gates.

```bash
cuedeck validate ./product-launch.cuedeck.json && echo "ok"
cuedeck validate "$DECK"
```

### `cuedeck render <deckId>`

Print a plain-text **running order** — card titles, talking-point notes, and
snippets — suitable for review or pasting into a doc. Snippet `{{variables}}` are
resolved against the deck's variable map; unset variables render as a visible
`⟦name⟧` marker so you can see what still needs filling in.

```bash
cuedeck render "$DECK"
# Product Launch
# 1 card
#
# 1. Kickoff
#    Welcome the audience
#    Snippets:
#      - Greeting: Hi Ada, welcome!
```

---

## End-to-end example

```bash
export CUEDECK_DIR=./demo-decks

DECK=$(cuedeck create "Product Launch")
CARD=$(cuedeck add-card "$DECK" --title "Kickoff" --notes "Welcome the audience")
cuedeck add-snippet "$DECK" "$CARD" --label "Greeting" --content "Hi {{name}}, welcome!"
cuedeck set-var "$DECK" name "Ada"

cuedeck render "$DECK"                                   # review the running order
cuedeck export "$DECK" --out ./launch.cuedeck.json      # save it
cuedeck validate ./launch.cuedeck.json                  # gate it in CI
```

This exact flow (create → add-card → add-snippet → set-var → export → validate →
render, plus import round-trip) is covered by the integration test at
[`test/cli.test.ts`](../test/cli.test.ts), which drives the built binary against
a temporary `--dir`.
