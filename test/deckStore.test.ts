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
const removeMock = vi.fn(async () => {})
const listMock = vi.fn(async () => [])
const setPresenterMock = vi.fn(async () => {})
const loadMock = vi.fn(async (id: string) => makeDeck(id))
const createMock = vi.fn(async (name: string) => makeDeck(name))

type DeckStore = typeof import('../src/renderer/src/store/deckStore')['useDeckStore']
let useDeckStore: DeckStore

beforeEach(async () => {
  vi.useFakeTimers()
  saveMock.mockReset().mockImplementation(async (d: Deck) => ({ ...d, updatedAt: 'saved' }))
  removeMock.mockReset().mockResolvedValue(undefined)
  listMock.mockReset().mockResolvedValue([])
  setPresenterMock.mockReset().mockResolvedValue(undefined)
  loadMock.mockReset().mockImplementation(async (id: string) => makeDeck(id))
  createMock.mockReset().mockImplementation(async (name: string) => makeDeck(name))

  vi.stubGlobal('window', {
    cuedeck: {
      decks: {
        save: (d: Deck) => saveMock(d),
        remove: (id: string) => removeMock(id),
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
