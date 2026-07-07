## Summary
Ship a **headless CLI** (`cuedeck`) that can create and edit decks, snippets, and variables, validate/lint deck files, and import/export/render decks — all without launching the Electron GUI. This makes decks fully scriptable from any shell or AI agent.

## Motivation
Scripting and AI authoring need a non-GUI entry point. A CLI over the shared deck core lets agents (and power users) build demos programmatically, and gives the MCP server (#13) a clean layer to wrap.

## Requirements
- A CLI binary `cuedeck` (add to `package.json` `bin`), runnable via `node` / `npx` and buildable standalone.
- Reads/writes the **same on-disk deck store** the app uses (Electron `userData/decks/*.json`). Resolve the userData path without booting Electron — replicate the same directory the app uses per-OS (document the resolution), or allow an explicit `--dir`/`CUEDECK_DIR` override for headless/CI use.
- Commands (names indicative — keep them consistent and documented):
  - `cuedeck list` — list decks (id, name, card count, updatedAt); `--json` for machine output.
  - `cuedeck create <name>` → prints new deck id.
  - `cuedeck show <deckId>` — human summary; `--json` prints the full deck.
  - `cuedeck add-card <deckId> --title <t> [--notes <n>]` → prints card id.
  - `cuedeck add-snippet <deckId> <cardId> --label <l> --content <c|-\>` (support reading content from stdin with `-`).
  - `cuedeck set-var <deckId> <name> <value>` — deck-level variable (forward-compat with #7).
  - `cuedeck import <file.cuedeck.json>` — validate + import (new id), print id.
  - `cuedeck export <deckId> [--out <file>]` — write deck JSON (stdout if no `--out`).
  - `cuedeck validate <file|deckId>` — run shared `validateDeck`; nonzero exit on failure.
  - `cuedeck render <deckId>` — plain-text preview of the running order (titles, notes, snippets) suitable for review/paste.
- Consistent exit codes (0 ok, nonzero on validation/usage errors) and `--json` output on the read commands for agent consumption.
- Use the shared `validateDeck`/`normalizeDeck`/`createEmptyDeck` from #11 — no duplicated deck logic.

## Implementation notes
- Put CLI source under `src/cli/` and build it with the existing toolchain (add an electron-vite/tsup/tsc step or a dedicated build script; document how it's built and where the output bin lives).
- A small, dependency-light arg parser is fine; if you add one (e.g. `commander`), justify it.
- Add an integration test that drives the CLI end-to-end against a temp `--dir`: create → add-card → add-snippet → export → validate → render, asserting output.

## Acceptance criteria
- [ ] `cuedeck` bin runs headless (no Electron) and supports the commands above.
- [ ] Reads/writes the app's deck store; `--dir`/`CUEDECK_DIR` override works.
- [ ] Read commands support `--json`; exit codes are correct.
- [ ] End-to-end CLI test passes against a temp dir.
- [ ] `README.md` (or `docs/cli.md`) documents every command with examples.
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass.

Depends on: #13. Blocks: #15.
