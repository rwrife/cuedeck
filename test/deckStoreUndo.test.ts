import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueCard, Deck, Snippet } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '@shared/types'

/**
 * Store-level coverage for the #38 safety behaviors:
 *
 *  - Deleting a step / paste-ready content / variable is undoable, capturing the
 *    removed item and restoring it in place with a predictable focus target.
 *  - A save-blocked closeDeck flags the block and offers discard-and-close
 *    recovery that never pretends the data was saved.
 *  - Entering Present with a failing flush explains why it was blocked.
 *
 * The deck store is a Zustand singleton created at import, so each test resets
 * the module registry and re-imports it with a stubbed `window.cuedeck` bridge.
 */

function makeSnippet(id: string, label = ''): Snippet {
  return { id, label, content: `content-${id}` }
}

function makeCard(id: string, title = '', snippets: Snippet[] = []): CueCard {
  return { id, title, notes: '', snippets }
}

function makeDeck(id = 'deck-1', cards: CueCard[] = []): Deck {
  return {
    id,
    name: 'Test Deck',
    cards,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables: {}
  }
}

const saveMock = vi.fn(async (d: Deck) => ({ ...d, updatedAt: 'saved' }))
const setPresenterMock = vi.fn(async () => {})

type DeckStore = typeof import('../src/renderer/src/store/deckStore')['useDeckStore']
let useDeckStore: DeckStore

beforeEach(async () => {
  vi.useFakeTimers()
  saveMock.mockReset().mockImplementation(async (d: Deck) => ({ ...d, updatedAt: 'saved' }))
  setPresenterMock.mockReset().mockResolvedValue(undefined)

  vi.stubGlobal('window', {
    cuedeck: {
      decks: {
        save: (d: Deck) => saveMock(d),
        list: async () => []
      },
      window: {
        setPresenter: (on: boolean) => setPresenterMock(on)
      }
    }
  })

  vi.resetModules()
  const mod = await import('../src/renderer/src/store/deckStore')
  useDeckStore = mod.useDeckStore
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('removeCard is undoable (#38)', () => {
  it('captures the deleted step and restores it in place, focused', () => {
    const cards = [makeCard('a', 'Alpha'), makeCard('b', 'Beta'), makeCard('c', 'Gamma')]
    useDeckStore.setState({ deck: makeDeck('deck-1', cards), workspaceMode: 'build', activeCardId: 'b' })

    useDeckStore.getState().removeCard('b')
    expect(useDeckStore.getState().deck?.cards.map((c) => c.id)).toEqual(['a', 'c'])
    const undo = useDeckStore.getState().undo
    expect(undo?.kind).toBe('card')
    expect(undo?.label).toContain('Beta')

    useDeckStore.getState().undoLastDelete()
    const state = useDeckStore.getState()
    // Restored at its original index, with a predictable focus target.
    expect(state.deck?.cards.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(state.activeCardId).toBe('b')
    expect(state.focusCardId).toBe('b')
    expect(state.undo).toBeNull()
  })

  it('dismissUndo drops the pending undo without restoring', () => {
    const cards = [makeCard('a', 'Alpha')]
    useDeckStore.setState({ deck: makeDeck('deck-1', cards), workspaceMode: 'build', activeCardId: 'a' })

    useDeckStore.getState().removeCard('a')
    useDeckStore.getState().dismissUndo()

    expect(useDeckStore.getState().deck?.cards).toEqual([])
    expect(useDeckStore.getState().undo).toBeNull()
  })

  it('ignores a stale undo after the deck is switched', () => {
    const cards = [makeCard('a', 'Alpha')]
    useDeckStore.setState({ deck: makeDeck('deck-1', cards), workspaceMode: 'build', activeCardId: 'a' })
    useDeckStore.getState().removeCard('a')

    // Simulate landing on a different deck (undo entry now belongs to deck-1).
    useDeckStore.setState({ deck: makeDeck('deck-2', [makeCard('x')]) })
    useDeckStore.getState().undoLastDelete()

    // No stale card leaks into the new deck; the undo is discarded.
    expect(useDeckStore.getState().deck?.cards.map((c) => c.id)).toEqual(['x'])
    expect(useDeckStore.getState().undo).toBeNull()
  })
})

describe('removeSnippet is undoable (#38)', () => {
  it('restores the deleted content in place with a snippet focus target', () => {
    const card = makeCard('a', 'Alpha', [makeSnippet('s1', 'One'), makeSnippet('s2', 'Two')])
    useDeckStore.setState({ deck: makeDeck('deck-1', [card]), workspaceMode: 'build', activeCardId: 'a' })

    useDeckStore.getState().removeSnippet('a', 's1')
    expect(useDeckStore.getState().deck?.cards[0].snippets.map((s) => s.id)).toEqual(['s2'])
    expect(useDeckStore.getState().undo?.kind).toBe('snippet')

    useDeckStore.getState().undoLastDelete()
    const state = useDeckStore.getState()
    expect(state.deck?.cards[0].snippets.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(state.activeCardId).toBe('a')
    expect(state.focusSnippetId).toBe('s1')
    expect(state.undo).toBeNull()
  })
})

describe('removeVariable is undoable (#38)', () => {
  it('restores the deleted variable at its original position, preserving its value', () => {
    const deck = makeDeck('deck-1', [makeCard('a')])
    deck.variables = { first: '1', second: '2', third: '3' }
    useDeckStore.setState({ deck, workspaceMode: 'build', activeCardId: 'a' })

    useDeckStore.getState().removeVariable('second')
    expect(Object.keys(useDeckStore.getState().deck?.variables ?? {})).toEqual(['first', 'third'])
    expect(useDeckStore.getState().undo?.kind).toBe('variable')

    useDeckStore.getState().undoLastDelete()
    const vars = useDeckStore.getState().deck?.variables ?? {}
    expect(Object.keys(vars)).toEqual(['first', 'second', 'third'])
    expect(vars.second).toBe('2')
    expect(useDeckStore.getState().focusVariableName).toBe('second')
  })

  it('does not lose a variable value with a falsy-but-present empty string', () => {
    const deck = makeDeck('deck-1', [makeCard('a')])
    deck.variables = { only: '' }
    useDeckStore.setState({ deck, workspaceMode: 'build', activeCardId: 'a' })

    useDeckStore.getState().removeVariable('only')
    useDeckStore.getState().undoLastDelete()

    const vars = useDeckStore.getState().deck?.variables ?? {}
    expect(vars).toHaveProperty('only')
    expect(vars.only).toBe('')
  })
})

describe('closeDeck blocked by a failing flush + discardAndClose recovery (#38)', () => {
  it('does not close and flags the block when the pre-close flush fails', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1', [makeCard('a')]), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // makes it dirty

    await useDeckStore.getState().closeDeck()

    const state = useDeckStore.getState()
    expect(state.deck?.id).toBe('deck-1') // still open, nothing lost
    expect(state.closeBlocked).toBe(true)
    expect(state.saveError).not.toBeNull()
  })

  it('discardAndClose returns to Library without pretending the data was saved', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1', [makeCard('a')]), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    await useDeckStore.getState().closeDeck()
    expect(useDeckStore.getState().closeBlocked).toBe(true)

    await useDeckStore.getState().discardAndClose()

    const state = useDeckStore.getState()
    expect(state.deck).toBeNull()
    expect(state.workspaceMode).toBe('library')
    expect(state.closeBlocked).toBe(false)
  })

  it('a successful close clears any prior blocked flag', async () => {
    useDeckStore.setState({
      deck: makeDeck('deck-1', [makeCard('a')]),
      workspaceMode: 'build',
      closeBlocked: true
    })

    await useDeckStore.getState().closeDeck()

    expect(useDeckStore.getState().deck).toBeNull()
    expect(useDeckStore.getState().closeBlocked).toBe(false)
  })
})

describe('enterPresent explains a save-blocked transition (#38)', () => {
  it('surfaces a status message when the pre-Present flush fails', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1', [makeCard('a')]), workspaceMode: 'build' })
    useDeckStore.getState().addCard()

    await useDeckStore.getState().enterPresent()

    const state = useDeckStore.getState()
    expect(state.workspaceMode).toBe('build')
    expect(state.statusMessage).toMatch(/presenting/i)
    expect(state.statusTone).toBe('danger')
    expect(setPresenterMock).not.toHaveBeenCalledWith(true)
  })
})
