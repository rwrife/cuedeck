import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Deck } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '@shared/types'

/**
 * Store-level coverage for the two tightly-coupled transition races (#38):
 *
 *  - Entering Present must not proceed when the pre-transition flush fails.
 *  - Deleting the currently open deck must quiesce the save coordinator before
 *    the underlying file is unlinked, so an in-flight save cannot recreate it.
 *
 * The deck store is a Zustand singleton created at import, so each test resets
 * the module registry and re-imports it for a fresh coordinator, with a stubbed
 * `window.cuedeck` bridge.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeDeck(id = 'deck-1'): Deck {
  return {
    id,
    name: 'Test Deck',
    cards: [],
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables: {}
  }
}

const saveMock = vi.fn(async (d: Deck) => ({ ...d, updatedAt: 'saved' }))
const removeMock = vi.fn(async () => ({ ok: true }))
const renameMock = vi.fn(async (id: string, name: string) => ({
  ok: true,
  summary: { id, name, filePath: `/decks/${id}.json`, cardCount: 0, updatedAt: 'renamed' }
}))
const duplicateMock = vi.fn(async (id: string) => ({
  ok: true,
  summary: {
    id: `${id}-copy`,
    name: 'Copy',
    filePath: `/decks/${id}-copy.json`,
    cardCount: 0,
    updatedAt: 'duplicated'
  }
}))
const listMock = vi.fn(async () => [])
const setPresenterMock = vi.fn(async () => {})
const loadMock = vi.fn(async (id: string) => makeDeck(id))
const createMock = vi.fn(async (name: string) => makeDeck(name))

type DeckStore = typeof import('../src/renderer/src/store/deckStore')['useDeckStore']
let useDeckStore: DeckStore

beforeEach(async () => {
  vi.useFakeTimers()
  saveMock.mockReset().mockImplementation(async (d: Deck) => ({ ...d, updatedAt: 'saved' }))
  removeMock.mockReset().mockResolvedValue({ ok: true })
  renameMock.mockReset().mockImplementation(async (id: string, name: string) => ({
    ok: true,
    summary: { id, name, filePath: `/decks/${id}.json`, cardCount: 0, updatedAt: 'renamed' }
  }))
  duplicateMock.mockReset().mockImplementation(async (id: string) => ({
    ok: true,
    summary: {
      id: `${id}-copy`,
      name: 'Copy',
      filePath: `/decks/${id}-copy.json`,
      cardCount: 0,
      updatedAt: 'duplicated'
    }
  }))
  listMock.mockReset().mockResolvedValue([])
  setPresenterMock.mockReset().mockResolvedValue(undefined)
  loadMock.mockReset().mockImplementation(async (id: string) => makeDeck(id))
  createMock.mockReset().mockImplementation(async (name: string) => makeDeck(name))

  vi.stubGlobal('window', {
    cuedeck: {
      decks: {
        save: (d: Deck) => saveMock(d),
        remove: (id: string) => removeMock(id),
        rename: (id: string, name: string) => renameMock(id, name),
        duplicate: (id: string) => duplicateMock(id),
        list: () => listMock(),
        load: (id: string) => loadMock(id),
        create: (name: string) => createMock(name)
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

describe('enterPresent → Present flush gating (#38)', () => {
  it('does not enter Present when the pre-transition flush fails', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // makes the deck dirty

    await useDeckStore.getState().enterPresent()

    // Build stays active and a typed save error is preserved — consistent with
    // closeDeck — instead of silently entering a Presenter window mid-failure.
    expect(useDeckStore.getState().workspaceMode).toBe('build')
    expect(useDeckStore.getState().saveError).not.toBeNull()
    expect(setPresenterMock).not.toHaveBeenCalledWith(true)
  })

  it('enters Present when the flush succeeds', async () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })
    useDeckStore.getState().addCard()

    await useDeckStore.getState().enterPresent()

    expect(useDeckStore.getState().workspaceMode).toBe('present')
    expect(setPresenterMock).toHaveBeenCalledWith(true)
  })

  it('leaving Present never requires a flush and always succeeds', async () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'present' })

    useDeckStore.getState().exitPresent()

    // The shell returns to Rehearse (not Build) when leaving the Present surface.
    expect(useDeckStore.getState().workspaceMode).toBe('rehearse')
    expect(saveMock).not.toHaveBeenCalled()
    expect(setPresenterMock).toHaveBeenCalledWith(false)
  })
})

describe('deleteDeck safety for the open deck (#38)', () => {
  it('waits for an in-flight save to settle before unlinking (no recreation race)', async () => {
    const order: string[] = []
    const pending = deferred<Deck>()
    saveMock.mockImplementation(() => pending.promise)
    removeMock.mockImplementation(async () => {
      order.push('remove')
    })

    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    // Fire the debounce so a real write is in flight when the delete arrives.
    await vi.advanceTimersByTimeAsync(600)
    expect(saveMock).toHaveBeenCalledTimes(1)

    const del = useDeckStore.getState().deleteDeck('deck-1')
    await Promise.resolve()
    // The file must NOT be unlinked while a save is still in flight.
    expect(removeMock).not.toHaveBeenCalled()

    order.push('save')
    pending.resolve(makeDeck('deck-1'))
    await del

    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['save', 'remove'])
    expect(useDeckStore.getState().deck).toBeNull()
  })

  it('still deletes when the in-flight save fails (deletion supersedes persistence)', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('write failed')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    await vi.advanceTimersByTimeAsync(600)

    await useDeckStore.getState().deleteDeck('deck-1')

    expect(removeMock).toHaveBeenCalledWith('deck-1')
    expect(useDeckStore.getState().deck).toBeNull()
  })

  it('does not re-arm a save after the open deck is deleted', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // pending debounce, not yet flushed

    await useDeckStore.getState().deleteDeck('deck-1')
    saveMock.mockClear()

    // Any pending debounce must have been cancelled by the delete.
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('leaves the open deck untouched when a different deck is deleted', async () => {
    useDeckStore.setState({ deck: makeDeck('open'), workspaceMode: 'build' })

    await useDeckStore.getState().deleteDeck('other')

    expect(removeMock).toHaveBeenCalledWith('other')
    expect(useDeckStore.getState().deck?.id).toBe('open')
  })
})

describe('addCard / addSnippet return the new id for immediate focus (#35)', () => {
  it('addCard returns the new step id and makes it active', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })

    const id = useDeckStore.getState().addCard()

    expect(typeof id).toBe('string')
    expect(useDeckStore.getState().activeCardId).toBe(id)
    expect(useDeckStore.getState().deck?.cards.map((c) => c.id)).toEqual([id])
  })

  it('addCard returns a distinct id for each new step', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })

    const first = useDeckStore.getState().addCard()
    const second = useDeckStore.getState().addCard()

    expect(first).not.toBe(second)
    expect(useDeckStore.getState().deck?.cards.map((c) => c.id)).toEqual([first, second])
  })

  it('addSnippet returns the new paste-ready content id when the card exists', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })
    const cardId = useDeckStore.getState().addCard()

    const snippetId = useDeckStore.getState().addSnippet(cardId)

    expect(typeof snippetId).toBe('string')
    const card = useDeckStore.getState().deck?.cards.find((c) => c.id === cardId)
    expect(card?.snippets.map((s) => s.id)).toEqual([snippetId])
  })

  it('addSnippet returns null and does not mutate the deck for an unknown cardId', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    const before = useDeckStore.getState().deck

    const result = useDeckStore.getState().addSnippet('does-not-exist')

    expect(result).toBeNull()
    // No spurious edit/save should have been armed for a no-op mutation.
    expect(useDeckStore.getState().deck).toBe(before)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('addCard starts with an empty title (no legacy "New Card" default)', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })

    const id = useDeckStore.getState().addCard()

    const card = useDeckStore.getState().deck?.cards.find((c) => c.id === id)
    expect(card?.title).toBe('')
  })

  it('addSnippet starts with an empty label (no legacy "New Snippet" default)', () => {
    useDeckStore.setState({ deck: makeDeck(), workspaceMode: 'build' })
    const cardId = useDeckStore.getState().addCard()

    const snippetId = useDeckStore.getState().addSnippet(cardId)

    const card = useDeckStore.getState().deck?.cards.find((c) => c.id === cardId)
    const snippet = card?.snippets.find((s) => s.id === snippetId)
    expect(snippet?.label).toBe('')
  })
})

describe('open/create flush the outgoing deck before switching (#33/#38)', () => {
  it('flushes the previous deck\'s pending edit before opening another', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // pending debounce, not yet flushed
    expect(saveMock).not.toHaveBeenCalled()

    loadMock.mockResolvedValueOnce(makeDeck('deck-2'))
    await useDeckStore.getState().openDeck('deck-2')

    // The outgoing deck's queued edit must be persisted before the switch so
    // the debounce can't drop the last change — this preserves the pending-save
    // guarantee now that the flush lives in SaveCoordinator (replacing the old
    // module-level pendingSave timer).
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].id).toBe('deck-1')
    expect(useDeckStore.getState().deck?.id).toBe('deck-2')
    expect(useDeckStore.getState().workspaceMode).toBe('build')
  })

  it('flushes the previous deck\'s pending edit before creating another', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    expect(saveMock).not.toHaveBeenCalled()

    createMock.mockResolvedValueOnce(makeDeck('new-deck'))
    await useDeckStore.getState().createDeck('New')

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].id).toBe('deck-1')
    expect(useDeckStore.getState().deck?.id).toBe('new-deck')
    expect(useDeckStore.getState().workspaceMode).toBe('build')
  })
})

describe('guided New Demo → blank demo (#34)', () => {
  it('seeds and focuses one first step on a fresh empty deck', async () => {
    createMock.mockResolvedValueOnce(makeDeck('blank-1'))

    await useDeckStore.getState().createBlankDemo('Blank Demo')

    const state = useDeckStore.getState()
    expect(state.deck?.cards).toHaveLength(1)
    expect(state.activeCardId).toBe(state.deck?.cards[0]?.id)
    expect(state.focusCardId).toBe(state.deck?.cards[0]?.id)
    expect(state.workspaceMode).toBe('build')
  })

  it('does not seed a card when the underlying create fails', async () => {
    createMock.mockRejectedValueOnce(new Error('disk full'))

    await useDeckStore.getState().createBlankDemo('Blank Demo')

    const state = useDeckStore.getState()
    expect(state.deck).toBeNull()
    expect(state.errors.create).toBeTruthy()
  })
})

describe('guided New Demo → starter template (#34)', () => {
  it('applies the starter template onto the freshly-created deck', async () => {
    createMock.mockResolvedValueOnce(makeDeck('template-1'))

    await useDeckStore.getState().createFromTemplate('My Demo')

    const state = useDeckStore.getState()
    expect(state.deck?.cards.length).toBeGreaterThan(0)
    expect(state.activeCardId).toBe(state.deck?.cards[0]?.id)
    expect(Object.keys(state.deck?.variables ?? {}).length).toBeGreaterThan(0)
  })

  it('does not apply the template when the underlying create fails', async () => {
    createMock.mockRejectedValueOnce(new Error('disk full'))

    await useDeckStore.getState().createFromTemplate('My Demo')

    expect(useDeckStore.getState().deck).toBeNull()
  })
})

describe('renameDeck (#34)', () => {
  it('renames a deck and refreshes summaries', async () => {
    await useDeckStore.getState().renameDeck('deck-9', 'New Name')

    expect(renameMock).toHaveBeenCalledWith('deck-9', 'New Name')
    expect(listMock).toHaveBeenCalled()
    expect(useDeckStore.getState().statusMessage).toContain('New Name')
    expect(useDeckStore.getState().statusTone).toBe('success')
    expect(useDeckStore.getState().errors.rename).toBeUndefined()
  })

  it('keeps the currently-open deck\'s in-memory name in sync when renamed', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-9'), workspaceMode: 'build' })

    await useDeckStore.getState().renameDeck('deck-9', 'New Name')

    expect(useDeckStore.getState().deck?.name).toBe('New Name')
  })

  it('surfaces a typed error and does not silently succeed on failure', async () => {
    renameMock.mockResolvedValueOnce({ ok: false, error: 'Deck not found.' })

    await useDeckStore.getState().renameDeck('missing', 'New Name')

    const state = useDeckStore.getState()
    expect(state.errors.rename?.message).toBe('Deck not found.')
    expect(state.statusMessage).toContain('Deck not found.')
    expect(state.statusTone).toBe('danger')
  })
})

describe('duplicateDeck (#34)', () => {
  it('duplicates a deck and refreshes summaries', async () => {
    await useDeckStore.getState().duplicateDeck('deck-9')

    expect(duplicateMock).toHaveBeenCalledWith('deck-9')
    expect(listMock).toHaveBeenCalled()
    expect(useDeckStore.getState().statusMessage).toContain('Duplicated')
    expect(useDeckStore.getState().statusTone).toBe('success')
    expect(useDeckStore.getState().errors.duplicate).toBeUndefined()
  })

  it('surfaces a typed error and does not silently succeed on failure', async () => {
    duplicateMock.mockResolvedValueOnce({ ok: false, error: 'Deck not found.' })

    await useDeckStore.getState().duplicateDeck('missing')

    const state = useDeckStore.getState()
    expect(state.errors.duplicate?.message).toBe('Deck not found.')
    expect(state.statusMessage).toContain('Deck not found.')
    expect(state.statusTone).toBe('danger')
  })
})

describe('renameDeck flushes the currently-open deck before renaming (persistence race fix)', () => {
  it('flushes pending edits on the open deck before renaming it', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // pending debounce, not yet flushed
    expect(saveMock).not.toHaveBeenCalled()

    await useDeckStore.getState().renameDeck('deck-1', 'New Name')

    // The flush must land BEFORE the rename IPC call, not merely at some point.
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].id).toBe('deck-1')
    expect(renameMock).toHaveBeenCalledWith('deck-1', 'New Name')
    expect(useDeckStore.getState().statusMessage).toContain('New Name')
  })

  it('aborts the rename and preserves the open deck untouched when the flush fails', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()

    await useDeckStore.getState().renameDeck('deck-1', 'New Name')

    // Never proceeds against stale on-disk data after a failed flush.
    expect(renameMock).not.toHaveBeenCalled()
    const state = useDeckStore.getState()
    expect(state.deck?.id).toBe('deck-1')
    expect(state.deck?.name).toBe('Test Deck')
    expect(state.workspaceMode).toBe('build')
    expect(state.errors.rename?.message).toBe('disk full')
    expect(state.statusMessage).toContain('disk full')
    expect(state.statusTone).toBe('danger')
  })

  it('does not flush the open deck when renaming a different deck', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // pending debounce on the OPEN deck, unrelated to the target

    await useDeckStore.getState().renameDeck('deck-9', 'New Name')

    expect(saveMock).not.toHaveBeenCalled()
    expect(renameMock).toHaveBeenCalledWith('deck-9', 'New Name')
    expect(useDeckStore.getState().deck?.id).toBe('deck-1')
  })
})

describe('duplicateDeck flushes the currently-open deck before duplicating (persistence race fix)', () => {
  it('flushes pending edits on the open deck before duplicating it', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()
    expect(saveMock).not.toHaveBeenCalled()

    await useDeckStore.getState().duplicateDeck('deck-1')

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].id).toBe('deck-1')
    expect(duplicateMock).toHaveBeenCalledWith('deck-1')
    expect(useDeckStore.getState().statusMessage).toContain('Duplicated')
  })

  it('aborts the duplicate and preserves the open deck untouched when the flush fails', async () => {
    saveMock.mockImplementation(async () => {
      throw new Error('disk full')
    })
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()

    await useDeckStore.getState().duplicateDeck('deck-1')

    expect(duplicateMock).not.toHaveBeenCalled()
    const state = useDeckStore.getState()
    expect(state.deck?.id).toBe('deck-1')
    expect(state.workspaceMode).toBe('build')
    expect(state.errors.duplicate?.message).toBe('disk full')
    expect(state.statusMessage).toContain('disk full')
    expect(state.statusTone).toBe('danger')
  })

  it('does not flush the open deck when duplicating a different deck', async () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard() // pending debounce on the OPEN deck, unrelated to the target

    await useDeckStore.getState().duplicateDeck('deck-9')

    expect(saveMock).not.toHaveBeenCalled()
    expect(duplicateMock).toHaveBeenCalledWith('deck-9')
    expect(useDeckStore.getState().deck?.id).toBe('deck-1')
  })
})

describe('deleteDeck surfaces typed result feedback (#34)', () => {
  it('surfaces a success status message on a normal delete', async () => {
    await useDeckStore.getState().deleteDeck('deck-9')

    expect(useDeckStore.getState().statusMessage).toBe('Deck deleted.')
    expect(useDeckStore.getState().statusTone).toBe('success')
    expect(useDeckStore.getState().errors.delete).toBeUndefined()
  })

  it('surfaces a typed error instead of silently succeeding when the file could not be removed', async () => {
    removeMock.mockResolvedValueOnce({ ok: false, error: 'Permission denied.' })

    await useDeckStore.getState().deleteDeck('deck-9')

    const state = useDeckStore.getState()
    expect(state.errors.delete?.message).toBe('Permission denied.')
    expect(state.statusMessage).toContain('Permission denied.')
    expect(state.statusTone).toBe('danger')
  })
})

describe('addCard sets a focus request (#34/Accessibility)', () => {
  it('marks the newly created card for focus', () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })

    useDeckStore.getState().addCard()

    const state = useDeckStore.getState()
    expect(state.focusCardId).toBe(state.activeCardId)
  })

  it('clearFocusCard consumes the pending request', () => {
    useDeckStore.setState({ deck: makeDeck('deck-1'), workspaceMode: 'build' })
    useDeckStore.getState().addCard()

    useDeckStore.getState().clearFocusCard()

    expect(useDeckStore.getState().focusCardId).toBeNull()
  })
})
