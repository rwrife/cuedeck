/**
 * `cuedeck-mcp` server construction (#15).
 *
 * Builds a high-level MCP {@link McpServer} that exposes CueDeck deck authoring
 * as Model Context Protocol tools and resources, so any MCP client (Claude
 * Desktop, the OpenClaw/Claude CLI, …) can build and edit demos conversationally
 * and have them land directly in the same on-disk deck store the desktop app and
 * CLI use.
 *
 * ## Scope (v1 = authoring only)
 * This server authors/edits decks *on disk*; it does not reach into a running
 * Electron app. Live control of the running app is a separate stretch issue
 * (#17). There is deliberately no socket into the app here.
 *
 * ## Design
 *  - **Shared core only.** Every mutation goes through {@link DeckRepository},
 *    the same operations layer the CLI uses, which itself writes through the
 *    shared `validateDeck`/`normalizeDeck` core. Tools never re-implement deck
 *    logic, so app / CLI / MCP can never drift.
 *  - **Validated inputs.** Each tool declares a Zod input schema (the SDK
 *    publishes these to clients as JSON Schema), so bad calls are rejected before
 *    a handler runs.
 *  - **Robust errors.** Handlers are wrapped so a {@link DeckRepositoryError}
 *    (unknown id, bad input) — or any unexpected throw — becomes a structured MCP
 *    tool error (`isError: true`) instead of crashing the stdio server.
 *  - **Injectable store.** `createCueDeckMcpServer` takes a {@link DeckStore}, so
 *    tests can point it at a throwaway `--dir`; the bin (`./index.ts`) resolves
 *    the real deck directory and passes a store in.
 */

import { z } from 'zod'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { DeckRepository, DeckRepositoryError, type DeckOutline } from '../cli/deckRepository'
import type { DeckStore } from '../cli/store'
import { registerLiveTools, type LiveToolsDeps } from './liveTools'

/** Package metadata advertised to MCP clients on connect. */
export const MCP_SERVER_NAME = 'cuedeck-mcp'
export const MCP_SERVER_VERSION = '0.1.0'

/** Stable URI scheme for CueDeck resources. */
export const DECK_URI_SCHEME = 'cuedeck'

/* -------------------------------------------------------------------------- */
/* Result helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Serialize a value as pretty JSON in a single text content block. */
function jsonResult(value: unknown): CallToolResult {
  const text = JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text', text }],
    // Also surface machine-readable output for clients that consume it. Records
    // only; wrap primitives/arrays under a `result` key so the field is always
    // an object (per the MCP structuredContent contract).
    structuredContent: isPlainObject(value) ? (value as Record<string, unknown>) : { result: value }
  }
}

/** Plain text result (used by `render_deck`). */
function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

/** A structured tool error (never throws out of the handler). */
function errorResult(code: string, message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } },
    isError: true
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Wrap a tool handler so any {@link DeckRepositoryError} becomes a structured
 * tool error with its code, and any unexpected throw becomes a generic
 * `internal_error` — the server keeps running either way.
 */
function guard<A>(fn: (args: A) => Promise<CallToolResult>): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await fn(args)
    } catch (err) {
      if (err instanceof DeckRepositoryError) {
        return errorResult(err.code, err.message)
      }
      return errorResult('internal_error', (err as Error).message ?? String(err))
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Server construction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a fully-wired CueDeck MCP server over the given deck store. The returned
 * server is not yet connected to a transport — the caller connects a
 * `StdioServerTransport` (the bin) or drives handlers directly (tests).
 *
 * Registers two independently-usable tool families:
 *  - **authoring** (#15): edit decks on disk (`create_deck_from_outline`, …).
 *  - **live control** (#17): drive the *running* app (`live_*`).
 *
 * @param store    the deck store the authoring tools read/write.
 * @param liveDeps optional injectable transport for the `live_*` tools; defaults
 *   to the real descriptor-file + `fetch` bridge client. Tests pass a fake so
 *   they can drive the live tools without a running app or sockets.
 */
export function createCueDeckMcpServer(store: DeckStore, liveDeps?: LiveToolsDeps): McpServer {
  const repo = new DeckRepository(store)

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        'Author and edit CueDeck demo decks. Decks are cards; cards hold ' +
        'talking-point notes and labeled clipboard snippets. Use ' +
        'create_deck_from_outline to build a whole demo in one call, then refine ' +
        'with add_card / add_snippet / set_variable. Read current state via the ' +
        `${DECK_URI_SCHEME}://decks resource or get_deck.`
    }
  )

  /* ------------------------------- Reads ------------------------------- */

  server.registerTool(
    'list_decks',
    {
      title: 'List decks',
      description: 'List all decks in the store as summaries (id, name, card count, updatedAt).',
      inputSchema: {}
    },
    guard(async () => jsonResult(await repo.listDecks()))
  )

  server.registerTool(
    'get_deck',
    {
      title: 'Get deck',
      description: 'Fetch a full deck (cards, snippets, variables) by id.',
      inputSchema: { deckId: z.string().describe('The deck id.') }
    },
    guard(async ({ deckId }) => jsonResult(await repo.getDeck(deckId)))
  )

  server.registerTool(
    'render_deck',
    {
      title: 'Render deck',
      description:
        'Render a deck as a plain-text running order (card titles, notes, and ' +
        'snippets with {{variables}} resolved). Handy for review.',
      inputSchema: { deckId: z.string().describe('The deck id.') }
    },
    guard(async ({ deckId }) => textResult(await repo.renderDeck(deckId)))
  )

  /* ------------------------------- Decks ------------------------------- */

  server.registerTool(
    'create_deck',
    {
      title: 'Create deck',
      description: 'Create a new, empty deck with the given name. Returns the new deck id.',
      inputSchema: { name: z.string().min(1).describe('Human-readable deck name.') }
    },
    guard(async ({ name }) => {
      const deck = await repo.createDeck(name)
      return jsonResult({ deckId: deck.id, name: deck.name })
    })
  )

  server.registerTool(
    'create_deck_from_outline',
    {
      title: 'Create deck from outline',
      description:
        'Build a complete multi-card deck in one call from a structured outline. ' +
        'This is the ergonomic "build me a demo" path: pass a name and an ordered ' +
        'list of cards (each with optional notes and snippets), plus optional ' +
        'deck-level variables. Returns the full persisted deck.',
      inputSchema: {
        name: z.string().min(1).describe('Deck name.'),
        cards: z
          .array(
            z.object({
              title: z.string().describe('Card title / beat heading.'),
              notes: z.string().optional().describe('Talking-point notes (Markdown allowed).'),
              snippets: z
                .array(
                  z.object({
                    label: z.string().describe('Short label shown on the copy button.'),
                    content: z.string().describe('Snippet body; may contain {{variables}}.')
                  })
                )
                .optional()
                .describe('Labeled clipboard snippets for this card.')
            })
          )
          .describe('Ordered cards that make up the demo.'),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe('Optional deck-level {{variable}} values to seed.')
      }
    },
    guard(async (args) => {
      const deck = await repo.createDeckFromOutline(args as DeckOutline)
      return jsonResult(deck)
    })
  )

  /* ------------------------------- Cards ------------------------------- */

  server.registerTool(
    'add_card',
    {
      title: 'Add card',
      description: 'Append a card to a deck. Returns the new card id.',
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        title: z.string().describe('Card title / beat heading.'),
        notes: z.string().optional().describe('Talking-point notes (Markdown allowed).')
      }
    },
    guard(async ({ deckId, title, notes }) => {
      const card = await repo.addCard(deckId, title, notes)
      return jsonResult({ cardId: card.id })
    })
  )

  server.registerTool(
    'update_card',
    {
      title: 'Update card',
      description: "Update a card's title and/or notes (only provided fields change).",
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        cardId: z.string().describe('The card id.'),
        title: z.string().optional().describe('New title.'),
        notes: z.string().optional().describe('New notes.')
      }
    },
    guard(async ({ deckId, cardId, title, notes }) => {
      const card = await repo.updateCard(deckId, cardId, { title, notes })
      return jsonResult({ cardId: card.id, title: card.title })
    })
  )

  server.registerTool(
    'reorder_cards',
    {
      title: 'Reorder cards',
      description: 'Move a card from one index to another within a deck (0-based; indices clamped).',
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        from: z.number().int().min(0).describe('Current index of the card.'),
        to: z.number().int().min(0).describe('Target index for the card.')
      }
    },
    guard(async ({ deckId, from, to }) => {
      const deck = await repo.reorderCards(deckId, from, to)
      return jsonResult({ deckId: deck.id, order: deck.cards.map((c) => c.id) })
    })
  )

  /* ----------------------------- Snippets ------------------------------ */

  server.registerTool(
    'add_snippet',
    {
      title: 'Add snippet',
      description: 'Append a labeled snippet to a card. Returns the new snippet id.',
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        cardId: z.string().describe('The card id.'),
        label: z.string().describe('Short label shown on the copy button.'),
        content: z.string().describe('Snippet body; may contain {{variables}}.')
      }
    },
    guard(async ({ deckId, cardId, label, content }) => {
      const snippet = await repo.addSnippet(deckId, cardId, label, content)
      return jsonResult({ snippetId: snippet.id })
    })
  )

  server.registerTool(
    'update_snippet',
    {
      title: 'Update snippet',
      description: "Update a snippet's label and/or content (only provided fields change).",
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        cardId: z.string().describe('The card id.'),
        snippetId: z.string().describe('The snippet id.'),
        label: z.string().optional().describe('New label.'),
        content: z.string().optional().describe('New content.')
      }
    },
    guard(async ({ deckId, cardId, snippetId, label, content }) => {
      const snippet = await repo.updateSnippet(deckId, cardId, snippetId, { label, content })
      return jsonResult({ snippetId: snippet.id, label: snippet.label })
    })
  )

  server.registerTool(
    'remove_snippet',
    {
      title: 'Remove snippet',
      description: 'Remove a snippet from a card. Returns the removed snippet id.',
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        cardId: z.string().describe('The card id.'),
        snippetId: z.string().describe('The snippet id.')
      }
    },
    guard(async ({ deckId, cardId, snippetId }) => {
      const removed = await repo.removeSnippet(deckId, cardId, snippetId)
      return jsonResult({ removedSnippetId: removed })
    })
  )

  server.registerTool(
    'reorder_snippets',
    {
      title: 'Reorder snippets',
      description: "Move a snippet within a card from one index to another (0-based; indices clamped).",
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        cardId: z.string().describe('The card id.'),
        from: z.number().int().min(0).describe('Current index of the snippet.'),
        to: z.number().int().min(0).describe('Target index for the snippet.')
      }
    },
    guard(async ({ deckId, cardId, from, to }) => {
      const card = await repo.reorderSnippets(deckId, cardId, from, to)
      return jsonResult({ cardId: card.id, order: card.snippets.map((s) => s.id) })
    })
  )

  /* ---------------------------- Variables ------------------------------ */

  server.registerTool(
    'set_variable',
    {
      title: 'Set variable',
      description:
        'Set a deck-level {{variable}} value used for snippet substitution. ' +
        'Creates the variable if absent, overwrites it otherwise.',
      inputSchema: {
        deckId: z.string().describe('The deck id.'),
        name: z.string().min(1).describe('Variable name (letters, digits, _.- ).'),
        value: z.string().describe('Variable value (stored verbatim).')
      }
    },
    guard(async ({ deckId, name, value }) => {
      const deck = await repo.setVariable(deckId, name, value)
      return jsonResult({ deckId: deck.id, variables: deck.variables ?? {} })
    })
  )

  /* ------------------------------ Resources ---------------------------- */

  // A readable list of all decks: `cuedeck://decks`.
  server.registerResource(
    'decks',
    `${DECK_URI_SCHEME}://decks`,
    {
      title: 'CueDeck decks',
      description: 'Summaries of all decks in the store.',
      mimeType: 'application/json'
    },
    async (uri) => {
      const summaries = await repo.listDecks()
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(summaries, null, 2)
          }
        ]
      }
    }
  )

  // A single deck document by id: `cuedeck://deck/{id}`.
  server.registerResource(
    'deck',
    new ResourceTemplate(`${DECK_URI_SCHEME}://deck/{id}`, {
      // Enumerate every deck as a concrete resource so clients can browse them.
      list: async () => {
        const summaries = await repo.listDecks()
        return {
          resources: summaries.map((s) => ({
            uri: `${DECK_URI_SCHEME}://deck/${s.id}`,
            name: s.name || s.id,
            description: `${s.cardCount} card${s.cardCount === 1 ? '' : 's'} · updated ${s.updatedAt}`,
            mimeType: 'application/json'
          }))
        }
      }
    }),
    {
      title: 'CueDeck deck',
      description: 'A full deck document (cards, snippets, variables) as JSON.',
      mimeType: 'application/json'
    },
    async (uri, variables) => {
      const id = Array.isArray(variables.id) ? variables.id[0] : variables.id
      try {
        const deck = await repo.getDeck(String(id))
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(deck, null, 2)
            }
          ]
        }
      } catch (err) {
        if (err instanceof DeckRepositoryError) {
          // Surface not-found as an empty-but-valid resource error via throw so
          // the SDK returns a proper JSON-RPC error to the client.
          throw new Error(err.message)
        }
        throw err
      }
    }
  )

  /* --------------------------- Live control (#17) ---------------------- */

  // Runtime tools that drive a *running* app over its opt-in loopback bridge.
  // Registered here so authoring + live tools are advertised together, but they
  // stay independently usable (live tools fail gracefully when the app is off).
  registerLiveTools(server, liveDeps)

  return server
}
