/**
 * Shared, dependency-free contracts for the **live demo control bridge** (#17).
 *
 * Live control lets an MCP client drive the *running* CueDeck app during a demo
 * — advance/select cards and copy snippets on cue — over a small, opt-in,
 * loopback-only HTTP bridge. This module is the single source of truth for the
 * command names, the request/response shapes, and the connection descriptor, so
 * the three parties that speak the protocol can never drift:
 *
 *  - the **Electron main process** ({@link ../main/liveControl}), which hosts the
 *    bridge and executes commands against the running window;
 *  - the **`cuedeck-mcp` server** ({@link ../mcp/liveTools}), whose `live_*`
 *    tools are thin clients of the bridge; and
 *  - the **tests**, which drive the pure request handler with a fake controller.
 *
 * Like `ipc.ts` and `presenter.ts`, this file is pure data/string logic with no
 * DOM, Electron, React, or Node dependency, so it can be unit-tested in the
 * plain Node test environment and imported identically from every process.
 *
 * ## Security model (summarized here; documented fully in `docs/live-control.md`)
 *  - **Opt-in.** Off by default; the user explicitly enables "Allow live control"
 *    in the running app. Nothing listens until then.
 *  - **Loopback-only.** The bridge binds strictly to {@link LIVE_CONTROL_HOST}
 *    (`127.0.0.1`); it is never exposed on a routable interface.
 *  - **Token-guarded.** A fresh, high-entropy {@link sessionToken} is generated
 *    per enable and required on *every* request (see {@link authorizeRequest}).
 *    Requests without the exact token are rejected with `401`.
 *  - **Minimal surface.** Only the small runtime command set below is exposed —
 *    no deck-mutating (create/delete/edit) or filesystem operations. Authoring
 *    stays in the separate on-disk MCP tools (#15).
 */

/** The loopback host the bridge binds to. Never a routable interface. */
export const LIVE_CONTROL_HOST = '127.0.0.1'

/** The HTTP path all bridge commands are POSTed to. */
export const LIVE_CONTROL_PATH = '/rpc'

/** HTTP header carrying the per-session bearer token. */
export const LIVE_CONTROL_TOKEN_HEADER = 'authorization'

/** Prefix for the bearer token in the {@link LIVE_CONTROL_TOKEN_HEADER}. */
export const LIVE_CONTROL_TOKEN_PREFIX = 'Bearer '

/**
 * Filename (under Electron's `userData`) of the connection descriptor the app
 * writes while live control is enabled and deletes when it's disabled/revoked.
 * The MCP `live_*` tools read it to discover where to connect. It contains a
 * secret token, so it is written user-readable only.
 */
export const LIVE_CONTROL_DESCRIPTOR_FILE = 'live-control.json'

/**
 * Environment variable an MCP client (tests / CI / advanced setups) can set to
 * point the `live_*` tools at an explicit descriptor file instead of the app's
 * default `userData/live-control.json`.
 */
export const LIVE_CONTROL_FILE_ENV = 'CUEDECK_LIVE_FILE'

/** The runtime commands the bridge accepts. Deliberately small and read/select/copy only. */
export const LIVE_CONTROL_COMMANDS = [
  'getState',
  'selectCard',
  'nextCard',
  'prevCard',
  'copySnippet',
  'enterPresenter',
  'exitPresenter'
] as const

/** A single live-control command name. */
export type LiveControlCommand = (typeof LIVE_CONTROL_COMMANDS)[number]

/** Type guard: is `value` one of the known {@link LIVE_CONTROL_COMMANDS}? */
export function isLiveControlCommand(value: unknown): value is LiveControlCommand {
  return typeof value === 'string' && (LIVE_CONTROL_COMMANDS as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/** Optional selector for the card-targeting commands: by 0-based index OR id. */
export interface CardSelector {
  /** Zero-based index into the running order. Mutually exclusive with `cardId`. */
  index?: number
  /** Explicit card id. Mutually exclusive with `index`. */
  cardId?: string
}

/** Optional selector for a snippet on the active card: by 0-based index OR id. */
export interface SnippetSelector {
  /** Zero-based index into the active card's snippets. Mutually exclusive with `snippetId`. */
  index?: number
  /** Explicit snippet id. Mutually exclusive with `index`. */
  snippetId?: string
}

/** A single request to the bridge: a command plus its (command-specific) params. */
export interface LiveControlRequest {
  command: LiveControlCommand
  /** Command params — a card/snippet selector for the targeting commands. */
  params?: CardSelector & SnippetSelector
}

/** A lightweight snippet descriptor returned in {@link LiveState}. */
export interface LiveSnippetInfo {
  id: string
  label: string
}

/** A lightweight card descriptor returned in {@link LiveState}. */
export interface LiveCardInfo {
  id: string
  title: string
  snippetCount: number
}

/**
 * The runtime state snapshot returned by `getState` (and echoed by mutating
 * commands so a client always sees the result of its action). Intentionally
 * minimal — enough to drive a demo, nothing that leaks full snippet contents.
 */
export interface LiveState {
  /** Whether a deck is currently open in the app. */
  deckOpen: boolean
  /** The open deck's id, or null when none is open. */
  deckId: string | null
  /** The open deck's name, or null when none is open. */
  deckName: string | null
  /** Total number of cards in the open deck. */
  cardCount: number
  /** Zero-based index of the active card, or -1 when none is active. */
  activeCardIndex: number
  /** The active card's id, or null when none is active. */
  activeCardId: string | null
  /** Whether the app is currently in Presenter Mode. */
  presenting: boolean
  /** The active card's snippets (id + label only), for `copySnippet` targeting. */
  snippets: LiveSnippetInfo[]
  /** Lightweight list of all cards (id + title + snippet count) for navigation. */
  cards: LiveCardInfo[]
}

/** Result of a successful `copySnippet`: what was placed on the clipboard. */
export interface CopyResult {
  /** The id of the snippet copied. */
  snippetId: string
  /** The snippet's label. */
  label: string
  /** The exact text placed on the clipboard (with `{{variables}}` resolved). */
  copied: string
}

/**
 * The envelope every bridge response uses. `ok: true` carries a command result
 * (a {@link LiveState}, a {@link CopyResult}, or `null`); `ok: false` carries a
 * structured {@link LiveControlError}. This mirrors the MCP tools' own structured
 * error convention so failures never crash the transport.
 */
export type LiveControlResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: LiveControlError }

/** A machine-readable error `{ code, message }` returned by the bridge. */
export interface LiveControlError {
  code: LiveControlErrorCode
  message: string
}

/** The stable set of error codes the bridge can return. */
export type LiveControlErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'unknown_command'
  | 'no_deck_open'
  | 'card_not_found'
  | 'snippet_not_found'
  | 'internal_error'

/**
 * The connection descriptor persisted to {@link LIVE_CONTROL_DESCRIPTOR_FILE}
 * while live control is enabled. The MCP tools read it to learn where and how to
 * connect. Deleted on disable/revoke and on app quit.
 */
export interface LiveControlDescriptor {
  /** Loopback host — always {@link LIVE_CONTROL_HOST}. */
  host: string
  /** The OS-assigned ephemeral port the bridge is listening on. */
  port: number
  /** The per-session bearer token required on every request. */
  token: string
  /** Descriptor format version, for forward compatibility. */
  version: number
  /** OS process id of the app hosting the bridge (diagnostic only). */
  pid: number
}

/** Current {@link LiveControlDescriptor} version. */
export const LIVE_CONTROL_DESCRIPTOR_VERSION = 1

/* -------------------------------------------------------------------------- */
/* Helpers (pure, shared by main + mcp + tests)                               */
/* -------------------------------------------------------------------------- */

/** Build the full bridge URL for the RPC endpoint from a descriptor. */
export function liveControlUrl(descriptor: Pick<LiveControlDescriptor, 'host' | 'port'>): string {
  return `http://${descriptor.host}:${descriptor.port}${LIVE_CONTROL_PATH}`
}

/** Build the `Authorization` header value for a token. */
export function bearer(token: string): string {
  return `${LIVE_CONTROL_TOKEN_PREFIX}${token}`
}

/**
 * Constant-time-ish token comparison. Avoids leaking length/prefix info via an
 * early-exit `===`. Both must be non-empty and equal to authorize. (For a
 * loopback-only, per-session token this is belt-and-suspenders, but cheap.)
 */
export function tokensMatch(expected: string, provided: string | undefined | null): boolean {
  if (!expected || !provided) return false
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Extract the bearer token from a request's headers. Accepts the standard
 * `Authorization: Bearer <token>` header (case-insensitive scheme). Returns
 * `undefined` when absent or malformed.
 */
export function extractToken(headerValue: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!raw) return undefined
  const trimmed = raw.trim()
  const prefix = LIVE_CONTROL_TOKEN_PREFIX.trim().toLowerCase()
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim()
  }
  return undefined
}

/**
 * Decide whether an incoming request is authorized against the expected token.
 * Pure and transport-agnostic so it can be reused by the HTTP server and driven
 * directly in tests (including the required "requests without the token are
 * rejected" case).
 */
export function authorizeRequest(
  expectedToken: string,
  headerValue: string | string[] | undefined
): boolean {
  return tokensMatch(expectedToken, extractToken(headerValue))
}

/** Convenience constructor for a structured bridge error. */
export function liveError(code: LiveControlErrorCode, message: string): LiveControlError {
  return { code, message }
}

/* -------------------------------------------------------------------------- */
/* State projection + selector resolution (pure; shared by renderer + tests)  */
/* -------------------------------------------------------------------------- */

/** The minimal deck shape {@link buildLiveState} needs (structurally satisfied by `Deck`). */
export interface LiveDeckLike {
  id: string
  name: string
  cards: ReadonlyArray<{ id: string; title: string; snippets: ReadonlyArray<{ id: string; label: string }> }>
}

/**
 * Project the app's current deck + active-card + presenter state into the
 * lightweight {@link LiveState} the bridge serves. Pure so the renderer and
 * tests build the exact same snapshot. A `null` deck yields the closed state.
 */
export function buildLiveState(
  deck: LiveDeckLike | null | undefined,
  activeCardId: string | null,
  presenting: boolean
): LiveState {
  if (!deck) {
    return {
      deckOpen: false,
      deckId: null,
      deckName: null,
      cardCount: 0,
      activeCardIndex: -1,
      activeCardId: null,
      presenting,
      snippets: [],
      cards: []
    }
  }
  const activeIndex = deck.cards.findIndex((c) => c.id === activeCardId)
  const activeCard = activeIndex >= 0 ? deck.cards[activeIndex] : undefined
  return {
    deckOpen: true,
    deckId: deck.id,
    deckName: deck.name,
    cardCount: deck.cards.length,
    activeCardIndex: activeIndex,
    activeCardId: activeCard?.id ?? null,
    presenting,
    snippets: (activeCard?.snippets ?? []).map((s) => ({ id: s.id, label: s.label })),
    cards: deck.cards.map((c) => ({
      id: c.id,
      title: c.title,
      snippetCount: c.snippets.length
    }))
  }
}

/**
 * Resolve a {@link CardSelector} against a card list to a concrete index.
 * Returns -1 when neither field is usable or the target doesn't exist. `index`
 * takes precedence over `cardId` when both are (unusually) supplied.
 */
export function resolveCardIndex(
  cards: ReadonlyArray<{ id: string }>,
  selector: CardSelector
): number {
  if (typeof selector.index === 'number') {
    return Number.isInteger(selector.index) && selector.index >= 0 && selector.index < cards.length
      ? selector.index
      : -1
  }
  if (typeof selector.cardId === 'string') {
    return cards.findIndex((c) => c.id === selector.cardId)
  }
  return -1
}

/**
 * Resolve a {@link SnippetSelector} against a snippet list to a concrete index.
 * Returns -1 when neither field is usable or the target doesn't exist. `index`
 * takes precedence over `snippetId` when both are supplied.
 */
export function resolveSnippetIndex(
  snippets: ReadonlyArray<{ id: string }>,
  selector: SnippetSelector
): number {
  if (typeof selector.index === 'number') {
    return Number.isInteger(selector.index) &&
      selector.index >= 0 &&
      selector.index < snippets.length
      ? selector.index
      : -1
  }
  if (typeof selector.snippetId === 'string') {
    return snippets.findIndex((s) => s.id === selector.snippetId)
  }
  return -1
}
