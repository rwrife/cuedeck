/**
 * Tests for the `cuedeck-mcp` MCP server (#15).
 *
 * Two complementary suites, both against a throwaway `--dir` (no real userData
 * is touched):
 *
 *  1. **Repository** — exercises the shared {@link DeckRepository} handlers that
 *     the MCP tools (and the CLI) call, including the headline
 *     `create_deck_from_outline` → `get_deck` round-trip and the structured
 *     error codes bad input produces. Fast and deterministic.
 *  2. **Wired server** — connects a real MCP {@link Client} to
 *     {@link createCueDeckMcpServer} over an in-memory linked transport and drives
 *     it exactly as a client would: `tools/list`, a
 *     `create_deck_from_outline` → `get_deck` round-trip asserting the persisted
 *     deck matches, a resource read, and a structured tool-error path (an unknown
 *     deck id must not crash the server).
 *
 * Driving the assembled server (not just the handlers) proves the tools and
 * resources are actually registered and that inputs/outputs flow through the SDK
 * correctly.
 */

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { DeckStore } from '../src/cli/store'
import { DeckRepository, DeckRepositoryError } from '../src/cli/deckRepository'
import { createCueDeckMcpServer } from '../src/mcp/server'
import { validateDeck, type Deck } from '../src/shared'

function tempStore(): { store: DeckStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cuedeck-mcp-'))
  return { store: new DeckStore(dir), dir }
}

/* -------------------------------------------------------------------------- */
/* Repository handlers (shared by CLI + MCP)                                  */
/* -------------------------------------------------------------------------- */

describe('DeckRepository — shared authoring operations', () => {
  let dir: string
  let repo: DeckRepository

  beforeEach(() => {
    const t = tempStore()
    dir = t.dir
    repo = new DeckRepository(t.store)
  })

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('create_deck_from_outline builds a full deck in one call and round-trips via get_deck', async () => {
    const built = await repo.createDeckFromOutline({
      name: 'Product Launch',
      variables: { name: 'Ada' },
      cards: [
        {
          title: 'Kickoff',
          notes: 'Welcome the audience',
          snippets: [
            { label: 'Greeting', content: 'Hi {{name}}, welcome!' },
            { label: 'Body', content: 'multi\nline body' }
          ]
        },
        { title: 'Wrap-up' }
      ]
    })

    // The persisted deck is valid and structurally what the outline described.
    expect(validateDeck(built).ok).toBe(true)
    expect(built.name).toBe('Product Launch')
    expect(built.cards).toHaveLength(2)
    expect(built.cards[0].title).toBe('Kickoff')
    expect(built.cards[0].snippets).toHaveLength(2)
    expect(built.cards[1].snippets).toHaveLength(0)
    expect(built.variables).toEqual({ name: 'Ada' })

    // get_deck returns exactly what was persisted (byte-for-byte deep equal).
    const fetched = await repo.getDeck(built.id)
    expect(fetched).toEqual(built)
  })

  it('renders {{variables}} in the running-order preview', async () => {
    const deck = await repo.createDeckFromOutline({
      name: 'Vars',
      variables: { who: 'World' },
      cards: [{ title: 'Intro', snippets: [{ label: 'Hi', content: 'Hi {{who}}' }] }]
    })
    const text = await repo.renderDeck(deck.id)
    expect(text).toContain('Hi World')
    expect(text).not.toContain('{{who}}')
  })

  it('supports the granular card/snippet/variable/reorder operations', async () => {
    const deck = await repo.createDeck('Manual')
    const c1 = await repo.addCard(deck.id, 'One', 'first')
    const c2 = await repo.addCard(deck.id, 'Two')
    expect(c1.id).not.toBe(c2.id)

    const updated = await repo.updateCard(deck.id, c1.id, { notes: 'edited' })
    expect(updated.notes).toBe('edited')
    expect(updated.title).toBe('One') // untouched field preserved

    const s1 = await repo.addSnippet(deck.id, c1.id, 'L1', 'v1')
    const s2 = await repo.addSnippet(deck.id, c1.id, 'L2', 'v2')
    await repo.updateSnippet(deck.id, c1.id, s1.id, { content: 'v1b' })
    await repo.reorderSnippets(deck.id, c1.id, 0, 1)
    await repo.reorderCards(deck.id, 0, 1)
    await repo.setVariable(deck.id, 'env', 'prod')
    await repo.removeSnippet(deck.id, c1.id, s2.id)

    const final = await repo.getDeck(deck.id)
    expect(validateDeck(final).ok).toBe(true)
    expect(final.cards.map((c) => c.id)).toEqual([c2.id, c1.id]) // reordered
    const editedCard = final.cards.find((c) => c.id === c1.id)!
    expect(editedCard.snippets).toHaveLength(1) // s2 removed
    expect(editedCard.snippets[0].id).toBe(s1.id)
    expect(editedCard.snippets[0].content).toBe('v1b')
    expect(final.variables).toEqual({ env: 'prod' })
  })

  it('throws structured errors with machine-readable codes', async () => {
    await expect(repo.getDeck('missing')).rejects.toMatchObject({
      code: 'deck_not_found'
    })

    const deck = await repo.createDeck('E')
    await expect(repo.addSnippet(deck.id, 'no-card', 'l', 'c')).rejects.toMatchObject({
      code: 'card_not_found'
    })

    const card = await repo.addCard(deck.id, 'C')
    await expect(
      repo.removeSnippet(deck.id, card.id, 'no-snippet')
    ).rejects.toBeInstanceOf(DeckRepositoryError)

    await expect(
      repo.createDeckFromOutline({ name: '', cards: [] })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

/* -------------------------------------------------------------------------- */
/* Wired MCP server (real Client over an in-memory transport)                 */
/* -------------------------------------------------------------------------- */

describe('cuedeck-mcp server (real MCP client over in-memory transport)', () => {
  let dir: string
  let client: Client

  beforeEach(async () => {
    const t = tempStore()
    dir = t.dir
    const server = createCueDeckMcpServer(t.store)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  })

  afterEach(async () => {
    await client.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  /** Parse the first text-content block of a tool result as JSON. */
  function json<T>(result: { content: Array<{ type: string; text?: string }> }): T {
    const block = result.content.find((c) => c.type === 'text')
    return JSON.parse(block?.text ?? 'null') as T
  }

  it('registers all authoring tools', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    // The authoring tools (#15) plus the live-control runtime tools (#17), which
    // createCueDeckMcpServer now also registers. Both families are advertised
    // together but remain independently usable.
    expect(names).toEqual(
      [
        'add_card',
        'add_snippet',
        'create_deck',
        'create_deck_from_outline',
        'get_deck',
        'list_decks',
        'remove_snippet',
        'render_deck',
        'reorder_cards',
        'reorder_snippets',
        'set_variable',
        'update_card',
        'update_snippet',
        'live_copy_snippet',
        'live_enter_presenter',
        'live_exit_presenter',
        'live_get_state',
        'live_next',
        'live_prev',
        'live_select_card'
      ].sort()
    )
  })

  it('create_deck_from_outline → get_deck round-trips through the wired server', async () => {
    const created = await client.callTool({
      name: 'create_deck_from_outline',
      arguments: {
        name: 'Wired Demo',
        variables: { who: 'World' },
        cards: [
          { title: 'Intro', notes: 'hello', snippets: [{ label: 'Greet', content: 'Hi {{who}}' }] },
          { title: 'Outro' }
        ]
      }
    })
    const builtDeck = json<Deck>(created)
    expect(validateDeck(builtDeck).ok).toBe(true)
    expect(builtDeck.cards).toHaveLength(2)

    const got = await client.callTool({ name: 'get_deck', arguments: { deckId: builtDeck.id } })
    const fetchedDeck = json<Deck>(got)
    // The deck fetched back through the server equals the one just created.
    expect(fetchedDeck).toEqual(builtDeck)

    // And it's actually discoverable/readable as a resource.
    const res = await client.readResource({ uri: `cuedeck://deck/${builtDeck.id}` })
    const fromResource = JSON.parse(res.contents[0].text as string) as Deck
    expect(fromResource.id).toBe(builtDeck.id)
    expect(fromResource.cards).toHaveLength(2)

    const list = await client.readResource({ uri: 'cuedeck://decks' })
    const summaries = JSON.parse(list.contents[0].text as string) as Array<{ id: string }>
    expect(summaries.some((s) => s.id === builtDeck.id)).toBe(true)
  })

  it('returns a structured tool error for an unknown deck id without crashing', async () => {
    const result = await client.callTool({ name: 'get_deck', arguments: { deckId: 'does-not-exist' } })
    expect(result.isError).toBe(true)
    expect((result.structuredContent as { error?: { code?: string } })?.error?.code).toBe(
      'deck_not_found'
    )

    // The server is still alive and serving after the error.
    const ok = await client.callTool({ name: 'list_decks', arguments: {} })
    expect(ok.isError).toBeFalsy()
  })
})
