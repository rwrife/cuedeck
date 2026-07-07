#!/usr/bin/env node
/**
 * `cuedeck-mcp` — the stdio MCP server binary (#15).
 *
 * A standalone Model Context Protocol server (stdio transport) that exposes
 * CueDeck deck authoring as MCP tools + resources, so any MCP client can build
 * and edit demos conversationally. It operates on the *same* on-disk deck store
 * as the desktop app and the `cuedeck` CLI, so a deck authored by an assistant
 * shows up in the GUI and vice-versa.
 *
 * ## Deck directory
 * Decks are read/written from the app's real `userData/decks` by default, or an
 * explicit `--dir <path>` / `CUEDECK_DIR` override for headless/CI use — the
 * exact same resolution the CLI uses (see {@link resolveDeckDir}). A client
 * config typically sets `CUEDECK_DIR` (or passes `--dir`) so the server writes
 * where you want.
 *
 * ## Transport
 * Communicates over stdio (stdin/stdout) per the MCP spec. All human-facing
 * logging goes to **stderr** so it never corrupts the JSON-RPC stream on stdout.
 *
 * Run directly (`cuedeck-mcp --dir /path/to/decks`) or wire it into a client's
 * MCP server config — see `docs/mcp.md`.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resolveDeckDir } from '../cli/deckDir'
import { DeckStore } from '../cli/store'
import { createCueDeckMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from './server'

/**
 * Read the `--dir <path>` flag (supports `--dir=path`) from argv, if present.
 * Everything else is ignored — the server takes no other arguments.
 */
function parseDirFlag(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--dir') {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) return next
      return ''
    }
    if (token.startsWith('--dir=')) {
      return token.slice('--dir='.length)
    }
  }
  return undefined
}

/** Diagnostics go to stderr so stdout stays a clean JSON-RPC channel. */
function logStderr(line: string): void {
  process.stderr.write(line + '\n')
}

/** Boot the server: resolve the deck dir, build the server, connect stdio. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dir = resolveDeckDir(parseDirFlag(argv))
  const store = new DeckStore(dir)
  await store.ensureDir()

  const server = createCueDeckMcpServer(store)
  const transport = new StdioServerTransport()

  await server.connect(transport)
  logStderr(`${MCP_SERVER_NAME} v${MCP_SERVER_VERSION} listening on stdio (decks: ${dir})`)

  // Keep the process alive until the transport closes (client disconnects).
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
  })
}

// Execute only when run as a program (not when imported by tests). Matches the
// CLI's ESM direct-invocation guard.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${(err as Error).message}\n`)
    process.exitCode = 1
  })
}
