/**
 * Live demo control **bridge** — the Electron-main half of #17.
 *
 * Hosts a tiny, opt-in, loopback-only HTTP server that lets an MCP client drive
 * the *running* CueDeck app during a demo (select/advance cards, copy snippets,
 * enter/exit Presenter Mode). The wire protocol, security model, and shared
 * types live in {@link ../shared/liveControl}; this module implements the
 * transport plus the app-facing execution.
 *
 * ## Design (mirrors the MCP server's separation of concerns)
 *  - **Pure handler.** {@link handleLiveControlRequest} does auth → parse →
 *    dispatch and returns a structured {@link LiveControlResponse}. It depends
 *    only on a small injected {@link LiveController} interface, so it is unit
 *    tested with a *fake* controller (no Electron, no window, no sockets) —
 *    including the required "requests without the token are rejected" case.
 *  - **Thin transport.** {@link LiveControlBridge} owns a Node `http` server
 *    bound strictly to loopback on an OS-assigned ephemeral port, a per-session
 *    token, and the on-disk connection descriptor the `live_*` MCP tools read.
 *    It delegates every request to the pure handler.
 *  - **No new deps.** Uses only Node's built-in `http`/`crypto` — nothing is
 *    added to `package.json`, and none of this is bundled into the renderer.
 *
 * The bridge exposes *only* the minimal runtime command set; there are no
 * deck-mutating or filesystem operations here. Authoring stays in the separate,
 * on-disk MCP tools (#15).
 */

import { randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'

import {
  LIVE_CONTROL_DESCRIPTOR_VERSION,
  LIVE_CONTROL_HOST,
  LIVE_CONTROL_PATH,
  authorizeRequest,
  isLiveControlCommand,
  liveControlUrl,
  liveError,
  type CopyResult,
  type LiveControlDescriptor,
  type LiveControlRequest,
  type LiveControlResponse,
  type LiveState
} from '../shared/liveControl'

/**
 * The app-facing operations the bridge performs. The real implementation talks
 * to the renderer (which owns the Zustand store) via IPC; tests supply a fake.
 *
 * Every method may reject/throw; the handler converts throws into a structured
 * `internal_error` so the transport never crashes. `no_deck_open` /
 * `card_not_found` / `snippet_not_found` are surfaced by returning the relevant
 * discriminated result from {@link CommandOutcome} rather than throwing, so the
 * handler can map them to precise error codes.
 */
export interface LiveController {
  /** Snapshot the current runtime state (deck/card/presenter). */
  getState(): Promise<LiveState>
  /** Select a card by index or id. */
  selectCard(selector: { index?: number; cardId?: string }): Promise<CommandOutcome<LiveState>>
  /** Advance to the next card (clamped at the end). */
  nextCard(): Promise<CommandOutcome<LiveState>>
  /** Step back to the previous card (clamped at the start). */
  prevCard(): Promise<CommandOutcome<LiveState>>
  /** Copy a snippet on the active card to the clipboard, by index or id. */
  copySnippet(selector: {
    index?: number
    snippetId?: string
  }): Promise<CommandOutcome<CopyResult>>
  /** Enter Presenter Mode. */
  enterPresenter(): Promise<CommandOutcome<LiveState>>
  /** Exit Presenter Mode. */
  exitPresenter(): Promise<CommandOutcome<LiveState>>
}

/**
 * A command result that either succeeded with a value or failed with a specific
 * domain reason the handler maps to a structured error code. Keeps the "no deck
 * open / not found" branches explicit and testable without exceptions.
 */
export type CommandOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'no_deck_open' | 'card_not_found' | 'snippet_not_found'; message: string }

/** Max accepted request body, in bytes. Commands are tiny; reject anything large. */
const MAX_BODY_BYTES = 64 * 1024

/* -------------------------------------------------------------------------- */
/* Pure request handling (unit-tested with a fake controller)                 */
/* -------------------------------------------------------------------------- */

/**
 * Auth-check, parse, and dispatch a single live-control request against a
 * {@link LiveController}. Never throws — every failure becomes a structured
 * `{ ok: false, error }` response. This is the seam the tests drive directly.
 *
 * @param controller   the app-facing executor (real IPC-backed one, or a fake).
 * @param expectedToken the per-session token the caller must present.
 * @param headerValue  the request's `Authorization` header (or undefined).
 * @param rawBody      the raw request body text (JSON-encoded {@link LiveControlRequest}).
 */
export async function handleLiveControlRequest(
  controller: LiveController,
  expectedToken: string,
  headerValue: string | string[] | undefined,
  rawBody: string
): Promise<LiveControlResponse> {
  // 1) Auth: reject anything without the exact per-session token.
  if (!authorizeRequest(expectedToken, headerValue)) {
    return {
      ok: false,
      error: liveError('unauthorized', 'Missing or invalid live-control token.')
    }
  }

  // 2) Parse + shape-check the body.
  let parsed: unknown
  try {
    parsed = rawBody.trim().length ? JSON.parse(rawBody) : {}
  } catch {
    return { ok: false, error: liveError('bad_request', 'Request body is not valid JSON.') }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: liveError('bad_request', 'Request body must be a JSON object.') }
  }
  const { command, params } = parsed as Partial<LiveControlRequest>
  if (!isLiveControlCommand(command)) {
    return {
      ok: false,
      error: liveError('unknown_command', `Unknown or missing command: ${String(command)}.`)
    }
  }

  // 3) Dispatch. Domain failures come back as discriminated outcomes; anything
  //    truly unexpected is caught and mapped to internal_error.
  try {
    switch (command) {
      case 'getState':
        return { ok: true, result: await controller.getState() }
      case 'selectCard':
        return fromOutcome(await controller.selectCard(selectorFrom(params)))
      case 'nextCard':
        return fromOutcome(await controller.nextCard())
      case 'prevCard':
        return fromOutcome(await controller.prevCard())
      case 'copySnippet':
        return fromOutcome(await controller.copySnippet(snippetSelectorFrom(params)))
      case 'enterPresenter':
        return fromOutcome(await controller.enterPresenter())
      case 'exitPresenter':
        return fromOutcome(await controller.exitPresenter())
      default:
        // Exhaustiveness guard; unreachable given the isLiveControlCommand check.
        return {
          ok: false,
          error: liveError('unknown_command', `Unhandled command: ${String(command)}.`)
        }
    }
  } catch (err) {
    return {
      ok: false,
      error: liveError('internal_error', (err as Error)?.message ?? String(err))
    }
  }
}

/** Narrow arbitrary params to a card selector (index or id). */
function selectorFrom(params: LiveControlRequest['params']): { index?: number; cardId?: string } {
  return {
    index: typeof params?.index === 'number' ? params.index : undefined,
    cardId: typeof params?.cardId === 'string' ? params.cardId : undefined
  }
}

/** Narrow arbitrary params to a snippet selector (index or id). */
function snippetSelectorFrom(params: LiveControlRequest['params']): {
  index?: number
  snippetId?: string
} {
  return {
    index: typeof params?.index === 'number' ? params.index : undefined,
    snippetId: typeof params?.snippetId === 'string' ? params.snippetId : undefined
  }
}

/** Map a {@link CommandOutcome} to a {@link LiveControlResponse}. */
function fromOutcome<T>(outcome: CommandOutcome<T>): LiveControlResponse<T> {
  if (outcome.ok) return { ok: true, result: outcome.value }
  return { ok: false, error: liveError(outcome.reason, outcome.message) }
}

/* -------------------------------------------------------------------------- */
/* HTTP transport                                                             */
/* -------------------------------------------------------------------------- */

/** Read a request body up to {@link MAX_BODY_BYTES}, rejecting oversized ones. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

/** Write a JSON response with the given status. */
function sendJson(res: ServerResponse, status: number, body: LiveControlResponse): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text)
  })
  res.end(text)
}

/**
 * The opt-in, loopback-only control bridge. Construct with a {@link LiveController}
 * (the IPC-backed executor), then {@link enable} to start listening and
 * {@link disable} to stop and revoke. Not started until `enable()` is called.
 */
export class LiveControlBridge {
  private server: Server | null = null
  private token = ''
  private boundPort = 0

  constructor(
    private readonly controller: LiveController,
    /** Called with the descriptor to persist on enable; deleted on disable. */
    private readonly persistDescriptor: (descriptor: LiveControlDescriptor) => Promise<void>,
    private readonly clearDescriptor: () => Promise<void>
  ) {}

  /** Whether the bridge is currently listening. */
  isEnabled(): boolean {
    return this.server !== null
  }

  /** The current connection descriptor, or null when disabled. */
  descriptor(): LiveControlDescriptor | null {
    if (!this.server) return null
    return {
      host: LIVE_CONTROL_HOST,
      port: this.boundPort,
      token: this.token,
      version: LIVE_CONTROL_DESCRIPTOR_VERSION,
      pid: process.pid
    }
  }

  /**
   * Start the bridge: generate a fresh token, bind an ephemeral loopback port,
   * and persist the descriptor. Idempotent — returns the existing descriptor if
   * already enabled (re-enabling does NOT rotate the token, so an in-flight
   * client keeps working; use {@link disable} then {@link enable} to rotate).
   */
  async enable(): Promise<LiveControlDescriptor> {
    if (this.server) return this.descriptor()!

    this.token = randomBytes(32).toString('hex')
    const server = createServer((req, res) => {
      void this.onRequest(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      // Bind strictly to loopback; port 0 lets the OS pick a free ephemeral port.
      server.listen(0, LIVE_CONTROL_HOST, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })

    const address = server.address()
    this.boundPort = typeof address === 'object' && address ? address.port : 0
    this.server = server

    const descriptor = this.descriptor()!
    await this.persistDescriptor(descriptor)
    return descriptor
  }

  /**
   * Stop the bridge and remove the descriptor. Safe to call when already
   * disabled. Instantly revokes access — the token is cleared and the socket
   * closed, so any client holding the old token can no longer connect.
   */
  async disable(): Promise<void> {
    const server = this.server
    this.server = null
    this.token = ''
    this.boundPort = 0
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await this.clearDescriptor()
  }

  /** The bound URL (diagnostic/testing), or null when disabled. */
  url(): string | null {
    const d = this.descriptor()
    return d ? liveControlUrl(d) : null
  }

  /** Route one HTTP request through the pure handler. */
  private async onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Only POST /rpc is served; everything else is a flat 404 (no token leak).
    const path = (req.url ?? '').split('?')[0]
    if (req.method !== 'POST' || path !== LIVE_CONTROL_PATH) {
      sendJson(res, 404, {
        ok: false,
        error: liveError('bad_request', `Not found: ${req.method} ${path}`)
      })
      return
    }

    let body = ''
    try {
      body = await readBody(req)
    } catch (err) {
      sendJson(res, 413, {
        ok: false,
        error: liveError('bad_request', (err as Error).message)
      })
      return
    }

    const auth = req.headers['authorization']
    const response = await handleLiveControlRequest(this.controller, this.token, auth, body)
    // 401 for auth failures, 200 otherwise (structured errors ride in the body).
    const status = !response.ok && response.error.code === 'unauthorized' ? 401 : 200
    sendJson(res, status, response)
  }
}
