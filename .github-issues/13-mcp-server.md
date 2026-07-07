## Summary
Ship an **MCP server** (`cuedeck-mcp`) that exposes CueDeck deck authoring as Model Context Protocol tools and resources, so any MCP client (Claude Desktop, Claude/OpenClaw CLI, etc.) can build and edit demos conversationally — and have them land directly in the app's deck store.

## Motivation
This is the headline capability: **AI builds demos.** By wrapping the shared deck core (#11) and CLI-equivalent operations (#12) in an MCP stdio server, an assistant can go from "build me a 12-card demo of feature X, with these paste blobs" to a real, openable CueDeck deck — no manual data entry.

## Scope (v1 = authoring only)
- v1 is **authoring/editing decks on disk**, not controlling the running app. Live control is a separate stretch issue (#17). Do not add a socket into the Electron process here.

## Requirements
- A standalone **stdio MCP server** binary `cuedeck-mcp` (add to `package.json` `bin`), implemented with the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`).
- Operates on the same deck store as the app/CLI, honoring a `--dir`/`CUEDECK_DIR` override for headless use.
- **Tools** (names indicative; document inputs/outputs with schemas):
  - `list_decks` → deck summaries.
  - `get_deck` (deckId) → full deck JSON.
  - `create_deck` (name) → deckId.
  - `add_card` (deckId, title, notes?) → cardId.
  - `update_card` (deckId, cardId, title?, notes?).
  - `add_snippet` (deckId, cardId, label, content) → snippetId.
  - `update_snippet` / `remove_snippet`.
  - `reorder_cards` / `reorder_snippets` (index moves).
  - `set_variable` (deckId, name, value) — forward-compat with #7.
  - `render_deck` (deckId) → plain-text running-order preview.
  - `create_deck_from_outline` (name, outline) — convenience: accepts a structured outline (array of {title, notes?, snippets?[]}) and builds the whole deck in one call. This is the ergonomic path for "build me a demo."
- **Resources:** expose decks as readable MCP resources (e.g. `cuedeck://decks` list and `cuedeck://deck/{id}` documents) so clients can read current state.
- All tool inputs validated with proper JSON schemas; all writes go through the shared `validateDeck`/`normalizeDeck` from #13.
- Robust errors: invalid ids / bad input return structured MCP errors, never crash the server.
- **Docs:** `docs/mcp.md` with (a) how to build/run the server, (b) a ready-to-paste client config snippet (Claude Desktop / OpenClaw MCP config), and (c) an example "build a demo" prompt showing the tools in action.

## Implementation notes
- Put server source under `src/mcp/`. Reuse the shared deck core and the same store-access module the CLI uses (extract a `deckRepository` module if helpful so CLI + MCP share it).
- Prefer building on top of the #14 core rather than shelling out to the CLI.
- Add a test that starts the server in-process (or exercises the underlying handlers) and runs a `create_deck_from_outline` → `get_deck` round-trip, asserting the persisted deck matches.
- Keep the MCP SDK dependency isolated to the server build; do not pull it into the renderer bundle.

## Acceptance criteria
- [ ] `cuedeck-mcp` stdio server runs and registers the tools + resources above.
- [ ] Tools operate on the shared deck store with `--dir`/`CUEDECK_DIR` support and shared validation.
- [ ] `create_deck_from_outline` builds a complete multi-card deck in one call.
- [ ] A round-trip test (outline → persisted deck) passes.
- [ ] `docs/mcp.md` includes build/run steps, a client config snippet, and an example prompt.
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass.

Depends on: #13, #14.
