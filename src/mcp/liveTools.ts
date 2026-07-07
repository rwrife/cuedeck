/**
 * `cuedeck-mcp` **live control** tools (#17).
 *
 * These `live_*` tools are thin clients of the running app's opt-in control
 * bridge (see {@link ../main/liveControl} + {@link ../shared/liveControl}). They
 * let an assistant act as a *live demo co-pilot*: while you talk, it advances to
 * the right card and copies the exact snippet you need so it's on your clipboard
 * the instant you reach that step.
 *
 * ## Separation from authoring (#15)
 * The authoring tools in {@link ./server} edit decks *on disk* and never touch a
 * running app. These runtime tools do the opposite: they *only* talk to a
 * running app and never edit deck files. A client can use either without the
 * other; keeping them namespaced (`live_*`) and separately registered makes the
 * boundary obvious.
 *
 * ## Discovery + auth
 * When the user enables "Allow live control" in the app, it writes a connection
 * descriptor (host/port/token) to `<userData>/live-control.json`
 * ({@link LIVE_CONTROL_DESCRIPTOR_FILE}); disabling deletes it. These tools read
 * that descriptor (or an explicit path via {@link LIVE_CONTROL_FILE_ENV}) and
 * present the token on every request. If the file is missing, stale, or the app
 * isn't reachable, every tool **no-ops with a helpful structured error** rather
 * than throwing — so an assistant can gracefully say "turn on live control".
 *
 * ## Safety
 * The bridge is loopback-only and token-guarded; these tools never widen that.
 * They expose exactly the runtime command set and nothing else.
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { userDataDir } from '../cli/deckDir'
import {
  LIVE_CONTROL_DESCRIPTOR_FILE,
  LIVE_CONTROL_FILE_ENV,
  bearer,
  liveControlUrl,
  type LiveControlDescriptor,
  type LiveControlRequest,
  type LiveControlResponse
} from '../shared/liveControl'

/**
 * How the `live_*` tools locate the running app's bridge. Injectable so tests
 * can point at a fake descriptor + transport without a real app or sockets.
 */
export interface LiveToolsDeps {
  /** Resolve the current connection descriptor, or null when live control is off. */
  loadDescriptor: () => Promise<LiveControlDescriptor | null>
  /** Perform one bridge RPC and return the parsed response envelope. */
  send: (
    descriptor: LiveControlDescriptor,
    request: LiveControlRequest
  ) => Promise<LiveControlResponse>
}

/* -------------------------------------------------------------------------- */
/* Result helpers (mirror server.ts conventions)                              */
/* -------------------------------------------------------------------------- */

function jsonResult(value: unknown): CallToolResult {
  const text = JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text', text }],
    structuredContent: isPlainObject(value) ? (value as Record<string, unknown>) : { result: value }
  }
}

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

/* -------------------------------------------------------------------------- */
/* Default deps: real descriptor file + fetch transport                       */
/* -------------------------------------------------------------------------- */

/** Absolute path to the connection descriptor (env override → app userData). */
export function descriptorPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[LIVE_CONTROL_FILE_ENV]
  if (override && override.trim().length > 0) return override
  return join(userDataDir(), LIVE_CONTROL_DESCRIPTOR_FILE)
}

/** Read + parse the descriptor file, returning null when absent/unreadable/invalid. */
export async function loadDescriptorFromDisk(
  env: NodeJS.ProcessEnv = process.env
): Promise<LiveControlDescriptor | null> {
  try {
    const raw = await fs.readFile(descriptorPath(env), 'utf-8')
    const parsed = JSON.parse(raw) as LiveControlDescriptor
    if (
      parsed &&
      typeof parsed.host === 'string' &&
      typeof parsed.port === 'number' &&
      typeof parsed.token === 'string'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/** POST one RPC to the bridge using the global `fetch`, mapping network errors. */
export async function sendOverHttp(
  descriptor: LiveControlDescriptor,
  request: LiveControlRequest
): Promise<LiveControlResponse> {
  const res = await fetch(liveControlUrl(descriptor), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: bearer(descriptor.token)
    },
    body: JSON.stringify(request)
  })
  // The bridge always returns a JSON envelope (even for 401/4xx); parse it.
  const data = (await res.json()) as LiveControlResponse
  return data
}

/** The default, production dependency set. */
export const defaultLiveToolsDeps: LiveToolsDeps = {
  loadDescriptor: () => loadDescriptorFromDisk(),
  send: sendOverHttp
}

/* -------------------------------------------------------------------------- */
/* Bridge call + registration                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Human-friendly guidance appended when the app can't be reached, so an
 * assistant knows exactly what to tell the user.
 */
const ENABLE_HINT =
  'Live control is unavailable. Make sure the CueDeck desktop app is running and ' +
  'that you have enabled "Allow live control" (🎛 Live) in it.'

/**
 * Run a single bridge command through the injected deps, translating every
 * failure mode into a structured tool error:
 *  - no descriptor / app off → `live_control_unavailable` (+ enable hint)
 *  - network/refused        → `live_control_unavailable` (+ enable hint)
 *  - bridge structured error → that error's code/message verbatim
 *  - success                → the command result as JSON
 */
async function callBridge(
  deps: LiveToolsDeps,
  request: LiveControlRequest
): Promise<CallToolResult> {
  const descriptor = await deps.loadDescriptor()
  if (!descriptor) {
    return errorResult('live_control_unavailable', ENABLE_HINT)
  }
  let response: LiveControlResponse
  try {
    response = await deps.send(descriptor, request)
  } catch (err) {
    // Connection refused / DNS / timeout: the app isn't listening (any more).
    return errorResult(
      'live_control_unavailable',
      `${ENABLE_HINT} (${(err as Error).message ?? String(err)})`
    )
  }
  if (!response.ok) {
    return errorResult(response.error.code, response.error.message)
  }
  return jsonResult(response.result)
}

/**
 * Register the `live_*` runtime tools onto an existing MCP server. Called from
 * {@link createCueDeckMcpServer} after the authoring tools so both sets are
 * advertised together, but they remain independently usable.
 *
 * @param server the MCP server to register onto.
 * @param deps   injectable descriptor loader + transport (defaults to the real
 *   descriptor file + `fetch`); tests pass a fake.
 */
export function registerLiveTools(
  server: McpServer,
  deps: LiveToolsDeps = defaultLiveToolsDeps
): void {
  server.registerTool(
    'live_get_state',
    {
      title: 'Live: get state',
      description:
        'Get the running app\u2019s current live state: open deck id/name, card ' +
        'count, the active card index/id, whether it\u2019s presenting, and the ' +
        'active card\u2019s snippets (id + label) for copy targeting. Fails with ' +
        'live_control_unavailable if the app is closed or live control is off.',
      inputSchema: {}
    },
    async () => callBridge(deps, { command: 'getState' })
  )

  server.registerTool(
    'live_select_card',
    {
      title: 'Live: select card',
      description:
        'Make a specific card active in the running app, by 0-based index OR by ' +
        'card id (provide exactly one). Returns the resulting live state.',
      inputSchema: {
        index: z.number().int().min(0).optional().describe('0-based card index.'),
        cardId: z.string().optional().describe('Explicit card id (alternative to index).')
      }
    },
    async ({ index, cardId }) =>
      callBridge(deps, { command: 'selectCard', params: { index, cardId } })
  )

  server.registerTool(
    'live_next',
    {
      title: 'Live: next card',
      description: 'Advance the running app to the next card (clamped at the end).',
      inputSchema: {}
    },
    async () => callBridge(deps, { command: 'nextCard' })
  )

  server.registerTool(
    'live_prev',
    {
      title: 'Live: previous card',
      description: 'Step the running app back to the previous card (clamped at the start).',
      inputSchema: {}
    },
    async () => callBridge(deps, { command: 'prevCard' })
  )

  server.registerTool(
    'live_copy_snippet',
    {
      title: 'Live: copy snippet',
      description:
        'Copy a snippet on the running app\u2019s ACTIVE card to the clipboard, by ' +
        '0-based index OR snippet id (provide exactly one). Deck {{variables}} are ' +
        'resolved before copying. Returns { snippetId, label, copied }.',
      inputSchema: {
        index: z.number().int().min(0).optional().describe('0-based snippet index on the active card.'),
        snippetId: z.string().optional().describe('Explicit snippet id (alternative to index).')
      }
    },
    async ({ index, snippetId }) =>
      callBridge(deps, { command: 'copySnippet', params: { index, snippetId } })
  )

  server.registerTool(
    'live_enter_presenter',
    {
      title: 'Live: enter Presenter Mode',
      description: 'Switch the running app into the compact, always-on-top Presenter Mode.',
      inputSchema: {}
    },
    async () => callBridge(deps, { command: 'enterPresenter' })
  )

  server.registerTool(
    'live_exit_presenter',
    {
      title: 'Live: exit Presenter Mode',
      description: 'Switch the running app out of Presenter Mode, back to the editor.',
      inputSchema: {}
    },
    async () => callBridge(deps, { command: 'exitPresenter' })
  )
}
