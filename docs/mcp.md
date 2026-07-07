# CueDeck MCP server (`cuedeck-mcp`)

**`cuedeck-mcp`** is a standalone [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes CueDeck deck authoring as MCP **tools** and **resources**, so
any MCP client — Claude Desktop, the Claude/OpenClaw CLI, Cursor, etc. — can
**build and edit demos conversationally** and have them land directly in the
app's on-disk deck store.

This is the headline "**AI builds demos**" capability: an assistant can go from
_"build me a 12-card demo of feature X, with these paste blobs"_ to a real,
openable CueDeck deck — no manual data entry.

- **Source:** [`src/mcp/`](../src/mcp) — [`index.ts`](../src/mcp/index.ts) (the
  stdio bin) + [`server.ts`](../src/mcp/server.ts) (tool/resource wiring).
- **Shared operations layer:** [`src/cli/deckRepository.ts`](../src/cli/deckRepository.ts)
  — the exact same authoring operations the [CLI](cli.md) uses, so app / CLI /
  MCP can never drift.
- **Shared deck core (validation/normalization/substitution):**
  [`src/shared/`](../src/shared) — every write goes through `validateDeck` /
  `normalizeDeck`.
- **File format:** [`docs/deck-format.md`](deck-format.md).

> **Scope (v1 = authoring only).** This server authors/edits decks **on disk**;
> it does **not** reach into a running Electron app. Live control of the running
> app is a separate stretch feature (issue #17). There is deliberately no socket
> into the app here.

---

## Install / build

The server is bundled by the project's build step into `out/mcp/index.js`, which
is registered as the `cuedeck-mcp` bin in `package.json`.

```bash
npm install
npm run build        # builds the app, the CLI, AND the MCP server (out/mcp/index.js)
# or just the MCP server:
npm run build:mcp
```

Run it any of these ways:

```bash
node ./out/mcp/index.js --dir ./my-decks     # direct
npx cuedeck-mcp --dir ./my-decks              # via the package bin (after build)
npm run mcp -- --dir ./my-decks               # rebuilds the server, then runs it
```

> Like the [CLI](cli.md), the server is built with a small dedicated **esbuild**
> step ([`scripts/build-mcp.mjs`](../scripts/build-mcp.mjs)) because
> `electron-vite` only builds the app's main/preload/renderer bundles. The MCP
> SDK (`@modelcontextprotocol/sdk`) and `zod` are kept **external** and resolved
> from `node_modules` at runtime — so the SDK stays entirely out of the renderer
> bundle and the output is a single self-contained ESM file with a
> `#!/usr/bin/env node` shebang.

The server communicates over **stdio** (stdin/stdout) per the MCP spec. All
human-facing logging goes to **stderr**, so it never corrupts the JSON-RPC
stream on stdout.

---

## Where decks are stored

By default the server reads/writes the app's real per-user deck directory —
Electron's `userData/decks`, resolved **without booting Electron** (identical to
the CLI):

| OS | Deck directory |
| --- | --- |
| **Windows** | `%APPDATA%\cuedeck\decks\` |
| **macOS** | `~/Library/Application Support/cuedeck/decks/` |
| **Linux** | `~/.config/cuedeck/decks/` (honors `$XDG_CONFIG_HOME`) |

So a deck an assistant authors through MCP shows up in the desktop app, and
vice-versa.

**Override the directory** (for headless runs, CI, or an isolated store), in
priority order:

1. `--dir <path>` flag (highest priority)
2. `CUEDECK_DIR` environment variable
3. the default `userData/decks` path

```bash
cuedeck-mcp --dir ./my-decks
CUEDECK_DIR=./my-decks cuedeck-mcp
```

An override points **directly at the decks directory** (deck files live inside
it). Resolution logic: [`src/cli/deckDir.ts`](../src/cli/deckDir.ts).

---

## Client configuration

MCP clients launch the server as a subprocess and talk to it over stdio. Point
the client at the built bin and (optionally) set `CUEDECK_DIR` so the server
writes where you want.

### Claude Desktop

Edit Claude Desktop's config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cuedeck": {
      "command": "node",
      "args": ["/absolute/path/to/cuedeck/out/mcp/index.js"],
      "env": {
        "CUEDECK_DIR": "/absolute/path/to/your/decks"
      }
    }
  }
}
```

Omit the `env` block to use the app's default deck directory (so decks appear in
the CueDeck desktop app automatically). Restart Claude Desktop after editing.

> If you've run `npm link` (or installed the package globally), you can use the
> bin name directly instead of an absolute path:
> `"command": "cuedeck-mcp", "args": ["--dir", "/absolute/path/to/your/decks"]`.

### OpenClaw / Claude CLI

Add an entry to your MCP server config (e.g. `~/.openclaw/openclaw.json` under
`mcpServers`, or via the CLI's MCP config):

```json
{
  "mcpServers": {
    "cuedeck": {
      "command": "node",
      "args": ["/absolute/path/to/cuedeck/out/mcp/index.js", "--dir", "/absolute/path/to/your/decks"]
    }
  }
}
```

Any MCP-capable client works the same way — the only requirements are a
`command` that launches the bin and, optionally, a `--dir` / `CUEDECK_DIR`
pointing at a deck directory.

---

## Tools

All inputs are validated (the SDK publishes each tool's schema to clients as JSON
Schema). Invalid ids or bad input return a **structured tool error**
(`isError: true`, with an `error.code` such as `deck_not_found`,
`card_not_found`, `snippet_not_found`, or `invalid_input`) — the server never
crashes.

| Tool | Input | Result |
| --- | --- | --- |
| `list_decks` | — | Deck summaries (`id`, `name`, `cardCount`, `updatedAt`). |
| `get_deck` | `deckId` | The full deck document. |
| `render_deck` | `deckId` | Plain-text running order (`{{variables}}` resolved). |
| `create_deck` | `name` | `{ deckId, name }`. |
| `create_deck_from_outline` | `name`, `cards[]`, `variables?` | The full persisted deck. |
| `add_card` | `deckId`, `title`, `notes?` | `{ cardId }`. |
| `update_card` | `deckId`, `cardId`, `title?`, `notes?` | `{ cardId, title }`. |
| `reorder_cards` | `deckId`, `from`, `to` | `{ deckId, order }`. |
| `add_snippet` | `deckId`, `cardId`, `label`, `content` | `{ snippetId }`. |
| `update_snippet` | `deckId`, `cardId`, `snippetId`, `label?`, `content?` | `{ snippetId, label }`. |
| `remove_snippet` | `deckId`, `cardId`, `snippetId` | `{ removedSnippetId }`. |
| `reorder_snippets` | `deckId`, `cardId`, `from`, `to` | `{ cardId, order }`. |
| `set_variable` | `deckId`, `name`, `value` | `{ deckId, variables }`. |

Snippet `content` may reference `{{variable}}` placeholders; `set_variable` (and
an outline's `variables`) supply their values, and `render_deck` resolves them.

### `create_deck_from_outline` — the ergonomic "build a demo" path

This one call builds a complete multi-card deck. Pass a `name`, an ordered list
of `cards` (each with optional `notes` and `snippets`), and optional deck-level
`variables`:

```jsonc
{
  "name": "Product Launch Demo",
  "variables": { "customer": "Acme", "region": "us-east-1" },
  "cards": [
    {
      "title": "Kickoff",
      "notes": "Welcome the audience; set the stage.",
      "snippets": [
        { "label": "Greeting", "content": "Hi {{customer}} team, welcome!" }
      ]
    },
    {
      "title": "Provision the cluster",
      "notes": "Show the one-liner, then talk through what it does.",
      "snippets": [
        { "label": "Deploy cmd", "content": "cuedeck deploy --region {{region}}" }
      ]
    },
    { "title": "Wrap-up & Q&A" }
  ]
}
```

It returns the fully-populated, persisted deck (with generated ids), ready to
open in the app.

---

## Resources

Clients can **read** current state as MCP resources:

| Resource URI | Contents |
| --- | --- |
| `cuedeck://decks` | JSON array of deck summaries. |
| `cuedeck://deck/{id}` | The full deck document as JSON. |

`cuedeck://deck/{id}` is a resource **template**; the server also enumerates
every deck as a concrete, browsable resource so clients can list and pick them.

---

## Example: build a demo conversationally

With the server configured, a prompt like this drives the tools end-to-end:

> **You:** _Build me a CueDeck demo called "Onboarding Walkthrough" for customer
> Acme. Five cards: Welcome, Create an account, Connect a data source, Run your
> first query, and Next steps. Add a copy-paste snippet on "Run your first query"
> with the SQL `SELECT * FROM events LIMIT 10;`, and set a `customer` variable to
> "Acme" so I can reuse this deck for other customers._

A capable assistant will typically:

1. Call **`create_deck_from_outline`** with the five cards (and the SQL snippet
   on the fourth), plus `variables: { "customer": "Acme" }` — building the whole
   deck in one shot.
2. Call **`render_deck`** to show you the running order for review.
3. Refine on request — e.g. **`add_snippet`** for another paste blob,
   **`update_card`** to reword notes, or **`reorder_cards`** to move a beat.

The deck is now on disk in your CueDeck deck directory — open the desktop app and
it's there, ready to present.

---

## Tests

The round-trip and wired-server behavior is covered by
[`test/mcp.test.ts`](../test/mcp.test.ts), which:

- exercises the shared `DeckRepository` handlers (including the
  `create_deck_from_outline` → `get_deck` round-trip and every structured error
  code), and
- connects a **real MCP client** to the assembled server over an in-memory
  transport and drives it exactly as a client would: `tools/list`, an
  outline → persisted-deck round-trip, a resource read, and a structured
  tool-error path (an unknown deck id must not crash the server).
