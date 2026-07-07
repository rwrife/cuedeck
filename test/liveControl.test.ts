/**
 * Tests for the live demo control bridge (#17).
 *
 * Four complementary layers, all pure/fast — no Electron, no real UI, and only a
 * transient loopback socket for the transport suite:
 *
 *  1. **Shared projection helpers** — `buildLiveState` /
 *     `resolveCardIndex` / `resolveSnippetIndex` produce the exact snapshots and
 *     selector resolution the renderer and bridge rely on.
 *  2. **Pure request handler** — {@link handleLiveControlRequest} against a
 *     **fake controller**: the required state/select/copy handlers, structured
 *     errors, and the required **auth-rejection** (requests without/with a wrong
 *     token are rejected) — with no transport involved.
 *  3. **HTTP transport** — a real {@link LiveControlBridge} bound to loopback:
 *     an authorized request drives the fake controller and returns its result;
 *     an unauthenticated request is rejected with `401`.
 *  4. **MCP `live_*` tools** — the runtime tools over a fake
 *     {@link LiveToolsDeps}: a successful `live_copy_snippet`, and the graceful
 *     `live_control_unavailable` no-op when the app is off (no descriptor).
 */

import { describe, expect, it } from 'vitest'

import {
  authorizeRequest,
  bearer,
  buildLiveState,
  extractToken,
  resolveCardIndex,
  resolveSnippetIndex,
  tokensMatch,
  type CopyResult,
  type LiveControlDescriptor,
  type LiveControlRequest,
  type LiveControlResponse,
  type LiveState
} from '../src/shared/liveControl'
import {
  LiveControlBridge,
  handleLiveControlRequest,
  type CommandOutcome,
  type LiveController
} from '../src/main/liveControl'
import {
  registerLiveTools,
  type LiveToolsDeps
} from '../src/mcp/liveTools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

/* -------------------------------------------------------------------------- */
/* A fake controller — an in-memory "app" the handler drives                  */
/* -------------------------------------------------------------------------- */

/**
 * A minimal fake of the running app: a fixed deck with two cards, tracking the
 * active card and presenter state. Enough to exercise every command + error
 * branch without Electron or a renderer.
 */
function makeFakeController(): LiveController & {
  activeIndex: number
  presenting: boolean
  lastCopied: string | null
} {
  const cards = [
    { id: 'card-a', title: 'Intro', snippets: [{ id: 'snip-1', label: 'Greeting' }] },
    { id: 'card-b', title: 'Outro', snippets: [] as Array<{ id: string; label: string }> }
  ]
  const state = {
    activeIndex: 0,
    presenting: false,
    lastCopied: null as string | null
  }

  function snapshot(): LiveState {
    return buildLiveState(
      { id: 'deck-1', name: 'Demo', cards },
      cards[state.activeIndex]?.id ?? null,
      state.presenting
    )
  }

  return {
    activeIndex: state.activeIndex,
    presenting: state.presenting,
    lastCopied: state.lastCopied,
    async getState() {
      return snapshot()
    },
    async selectCard(selector): Promise<CommandOutcome<LiveState>> {
      const idx = resolveCardIndex(cards, selector)
      if (idx < 0) return { ok: false, reason: 'card_not_found', message: 'no such card' }
      state.activeIndex = idx
      this.activeIndex = idx
      return { ok: true, value: snapshot() }
    },
    async nextCard(): Promise<CommandOutcome<LiveState>> {
      state.activeIndex = Math.min(state.activeIndex + 1, cards.length - 1)
      this.activeIndex = state.activeIndex
      return { ok: true, value: snapshot() }
    },
    async prevCard(): Promise<CommandOutcome<LiveState>> {
      state.activeIndex = Math.max(state.activeIndex - 1, 0)
      this.activeIndex = state.activeIndex
      return { ok: true, value: snapshot() }
    },
    async copySnippet(selector): Promise<CommandOutcome<CopyResult>> {
      const active = cards[state.activeIndex]
      const idx = resolveSnippetIndex(active.snippets, selector)
      if (idx < 0) return { ok: false, reason: 'snippet_not_found', message: 'no such snippet' }
      const snippet = active.snippets[idx]
      const copied = `content of ${snippet.label}`
      state.lastCopied = copied
      this.lastCopied = copied
      return { ok: true, value: { snippetId: snippet.id, label: snippet.label, copied } }
    },
    async enterPresenter(): Promise<CommandOutcome<LiveState>> {
      state.presenting = true
      this.presenting = true
      return { ok: true, value: snapshot() }
    },
    async exitPresenter(): Promise<CommandOutcome<LiveState>> {
      state.presenting = false
      this.presenting = false
      return { ok: true, value: snapshot() }
    }
  }
}

const TOKEN = 'test-token-abcdef0123456789'

/** Build the Authorization header for the shared test token. */
function authHeader(token = TOKEN): string {
  return bearer(token)
}

/* -------------------------------------------------------------------------- */
/* 1) Shared projection + selector helpers                                    */
/* -------------------------------------------------------------------------- */

describe('shared live-control projection helpers', () => {
  const deck = {
    id: 'd1',
    name: 'Deck One',
    cards: [
      { id: 'c1', title: 'One', snippets: [{ id: 's1', label: 'A' }, { id: 's2', label: 'B' }] },
      { id: 'c2', title: 'Two', snippets: [] }
    ]
  }

  it('buildLiveState projects an open deck with the active card + its snippets', () => {
    const state = buildLiveState(deck, 'c1', false)
    expect(state.deckOpen).toBe(true)
    expect(state.deckId).toBe('d1')
    expect(state.deckName).toBe('Deck One')
    expect(state.cardCount).toBe(2)
    expect(state.activeCardIndex).toBe(0)
    expect(state.activeCardId).toBe('c1')
    expect(state.presenting).toBe(false)
    expect(state.snippets).toEqual([
      { id: 's1', label: 'A' },
      { id: 's2', label: 'B' }
    ])
    expect(state.cards).toEqual([
      { id: 'c1', title: 'One', snippetCount: 2 },
      { id: 'c2', title: 'Two', snippetCount: 0 }
    ])
  })

  it('buildLiveState reports the closed state for a null deck', () => {
    const state = buildLiveState(null, null, false)
    expect(state).toMatchObject({
      deckOpen: false,
      deckId: null,
      cardCount: 0,
      activeCardIndex: -1,
      snippets: [],
      cards: []
    })
  })

  it('resolveCardIndex resolves by index and by id, and rejects bad targets', () => {
    expect(resolveCardIndex(deck.cards, { index: 1 })).toBe(1)
    expect(resolveCardIndex(deck.cards, { cardId: 'c2' })).toBe(1)
    expect(resolveCardIndex(deck.cards, { index: 9 })).toBe(-1)
    expect(resolveCardIndex(deck.cards, { cardId: 'nope' })).toBe(-1)
    expect(resolveCardIndex(deck.cards, {})).toBe(-1)
  })

  it('resolveSnippetIndex resolves by index and by id on a card', () => {
    const snippets = deck.cards[0].snippets
    expect(resolveSnippetIndex(snippets, { index: 0 })).toBe(0)
    expect(resolveSnippetIndex(snippets, { snippetId: 's2' })).toBe(1)
    expect(resolveSnippetIndex(snippets, { snippetId: 'x' })).toBe(-1)
    expect(resolveSnippetIndex(snippets, {})).toBe(-1)
  })

  it('token helpers: extract + constant-time match', () => {
    expect(extractToken(`Bearer ${TOKEN}`)).toBe(TOKEN)
    expect(extractToken('bearer ' + TOKEN)).toBe(TOKEN) // case-insensitive scheme
    expect(extractToken(undefined)).toBeUndefined()
    expect(extractToken('Basic xyz')).toBeUndefined()
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true)
    expect(tokensMatch(TOKEN, TOKEN + 'x')).toBe(false)
    expect(tokensMatch(TOKEN, '')).toBe(false)
    expect(tokensMatch('', '')).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 2) Pure request handler + auth rejection                                   */
/* -------------------------------------------------------------------------- */

describe('handleLiveControlRequest (pure, fake controller)', () => {
  it('returns state for getState with a valid token', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader(),
      JSON.stringify({ command: 'getState' } satisfies LiveControlRequest)
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      const state = res.result as LiveState
      expect(state.activeCardId).toBe('card-a')
      expect(state.snippets).toHaveLength(1)
    }
  })

  it('selects a card by id and reflects it in the returned state', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader(),
      JSON.stringify({ command: 'selectCard', params: { cardId: 'card-b' } })
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect((res.result as LiveState).activeCardId).toBe('card-b')
    expect(ctrl.activeIndex).toBe(1)
  })

  it('copies a snippet on the active card and returns the resolved text', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader(),
      JSON.stringify({ command: 'copySnippet', params: { index: 0 } })
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      const copy = res.result as CopyResult
      expect(copy.snippetId).toBe('snip-1')
      expect(copy.copied).toContain('Greeting')
    }
    expect(ctrl.lastCopied).toContain('Greeting')
  })

  it('maps a missing snippet to a structured snippet_not_found error', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader(),
      JSON.stringify({ command: 'copySnippet', params: { index: 5 } })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('snippet_not_found')
  })

  it('rejects an unknown command without touching the controller', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader(),
      JSON.stringify({ command: 'formatHardDrive' })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('unknown_command')
  })

  it('rejects malformed JSON with bad_request', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(ctrl, TOKEN, authHeader(), '{not json')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('bad_request')
  })

  it('REJECTS requests with a missing token', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      undefined,
      JSON.stringify({ command: 'getState' })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('unauthorized')
  })

  it('REJECTS requests with a wrong token', async () => {
    const ctrl = makeFakeController()
    const res = await handleLiveControlRequest(
      ctrl,
      TOKEN,
      authHeader('the-wrong-token'),
      JSON.stringify({ command: 'getState' })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('unauthorized')
    // authorizeRequest agrees at the unit level too.
    expect(authorizeRequest(TOKEN, authHeader('the-wrong-token'))).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 3) HTTP transport (real loopback bridge)                                   */
/* -------------------------------------------------------------------------- */

describe('LiveControlBridge over loopback HTTP', () => {
  it('serves an authorized command and rejects an unauthenticated one with 401', async () => {
    const ctrl = makeFakeController()
    let persisted: LiveControlDescriptor | null = null
    const bridge = new LiveControlBridge(
      ctrl,
      async (d) => {
        persisted = d
      },
      async () => {
        persisted = null
      }
    )

    const descriptor = await bridge.enable()
    try {
      // The descriptor was persisted and points at loopback with a token.
      expect(persisted).not.toBeNull()
      expect(descriptor.host).toBe('127.0.0.1')
      expect(descriptor.port).toBeGreaterThan(0)
      expect(descriptor.token.length).toBeGreaterThan(16)

      const url = bridge.url()!

      // Authorized getState → ok + real state.
      const okRes = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: bearer(descriptor.token) },
        body: JSON.stringify({ command: 'getState' })
      })
      expect(okRes.status).toBe(200)
      const okBody = (await okRes.json()) as LiveControlResponse
      expect(okBody.ok).toBe(true)
      if (okBody.ok) expect((okBody.result as LiveState).deckId).toBe('deck-1')

      // Missing token → 401 + structured unauthorized error.
      const noAuth = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'getState' })
      })
      expect(noAuth.status).toBe(401)
      const noAuthBody = (await noAuth.json()) as LiveControlResponse
      expect(noAuthBody.ok).toBe(false)
      if (!noAuthBody.ok) expect(noAuthBody.error.code).toBe('unauthorized')

      // Authorized copySnippet actually drives the fake controller.
      const copyRes = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: bearer(descriptor.token) },
        body: JSON.stringify({ command: 'copySnippet', params: { index: 0 } })
      })
      const copyBody = (await copyRes.json()) as LiveControlResponse
      expect(copyBody.ok).toBe(true)
      expect(ctrl.lastCopied).toContain('Greeting')
    } finally {
      await bridge.disable()
    }

    // After disable the descriptor is cleared and the socket is closed.
    expect(persisted).toBeNull()
    expect(bridge.isEnabled()).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 4) MCP live_* tools over a fake bridge transport                           */
/* -------------------------------------------------------------------------- */

describe('MCP live_* tools (fake transport)', () => {
  const descriptor: LiveControlDescriptor = {
    host: '127.0.0.1',
    port: 5999,
    token: TOKEN,
    version: 1,
    pid: 1234
  }

  /** Wire a real MCP client to a server that only has the live tools registered. */
  async function connectWith(deps: LiveToolsDeps): Promise<Client> {
    const server = new McpServer({ name: 'live-test', version: '0.0.0' })
    registerLiveTools(server, deps)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'live-test-client', version: '0.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    return client
  }

  function json<T>(result: { content: Array<{ type: string; text?: string }> }): T {
    const block = result.content.find((c) => c.type === 'text')
    return JSON.parse(block?.text ?? 'null') as T
  }

  it('registers exactly the seven live_* tools', async () => {
    const client = await connectWith({
      loadDescriptor: async () => descriptor,
      send: async () => ({ ok: true, result: null })
    })
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'live_copy_snippet',
        'live_enter_presenter',
        'live_exit_presenter',
        'live_get_state',
        'live_next',
        'live_prev',
        'live_select_card'
      ].sort()
    )
    await client.close()
  })

  it('live_copy_snippet forwards the request and returns the bridge result', async () => {
    const sent: LiveControlRequest[] = []
    const client = await connectWith({
      loadDescriptor: async () => descriptor,
      send: async (_d, req) => {
        sent.push(req)
        return {
          ok: true,
          result: { snippetId: 's9', label: 'SQL', copied: 'SELECT 1' } satisfies CopyResult
        }
      }
    })
    const res = await client.callTool({ name: 'live_copy_snippet', arguments: { index: 2 } })
    expect(res.isError).toBeFalsy()
    const copy = json<CopyResult>(res as { content: Array<{ type: string; text?: string }> })
    expect(copy).toEqual({ snippetId: 's9', label: 'SQL', copied: 'SELECT 1' })
    // The tool passed the selector straight through to the bridge.
    expect(sent).toEqual([{ command: 'copySnippet', params: { index: 2, snippetId: undefined } }])
    await client.close()
  })

  it('live_get_state no-ops with live_control_unavailable when the app is off', async () => {
    const client = await connectWith({
      loadDescriptor: async () => null, // descriptor missing → app off / live control disabled
      send: async () => {
        throw new Error('should not be called')
      }
    })
    const res = await client.callTool({ name: 'live_get_state', arguments: {} })
    expect(res.isError).toBe(true)
    expect(
      (res.structuredContent as { error?: { code?: string } })?.error?.code
    ).toBe('live_control_unavailable')
    await client.close()
  })

  it('surfaces a bridge structured error (e.g. no_deck_open) verbatim', async () => {
    const client = await connectWith({
      loadDescriptor: async () => descriptor,
      send: async () => ({
        ok: false,
        error: { code: 'no_deck_open', message: 'No deck is currently open.' }
      })
    })
    const res = await client.callTool({ name: 'live_next', arguments: {} })
    expect(res.isError).toBe(true)
    expect((res.structuredContent as { error?: { code?: string } })?.error?.code).toBe(
      'no_deck_open'
    )
    await client.close()
  })
})
