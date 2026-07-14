import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applySavedTimestamp,
  SaveCoordinator,
  type SaveView
} from '../src/renderer/src/store/saveCoordinator'

/** A minimal persistable stand-in for a Deck. */
interface TestDeck {
  id: string
  updatedAt: string
  content?: string
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const DEBOUNCE = 500

describe('SaveCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function setup(overrides: {
    save?: (d: TestDeck) => Promise<TestDeck>
    getDeck?: () => TestDeck | null
  } = {}) {
    let current: TestDeck = { id: 'deck-1', updatedAt: 't0' }
    const views: SaveView[] = []
    const onChange = vi.fn((v: SaveView) => views.push(v))
    const onSaved = vi.fn()
    const save =
      overrides.save ??
      vi.fn(async (d: TestDeck) => ({ ...d, updatedAt: `${d.updatedAt}+saved` }))
    const getDeck = overrides.getDeck ?? (() => current)
    const coord = new SaveCoordinator<TestDeck>({
      save,
      getDeck,
      onChange,
      onSaved,
      debounceMs: DEBOUNCE
    })
    return {
      coord,
      save,
      getDeck,
      onChange,
      onSaved,
      views,
      setDeck: (d: TestDeck) => {
        current = d
      }
    }
  }

  it('starts idle, not dirty, with no error', () => {
    const { coord } = setup()
    expect(coord.getView()).toEqual({ status: 'idle', dirty: false, error: null })
  })

  it('marks dirty on edit but debounces the actual write', () => {
    const { coord, save } = setup()
    coord.noteEdit()
    expect(coord.getView().dirty).toBe(true)
    expect(coord.getView().status).toBe('idle')
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(DEBOUNCE - 1)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('transitions idle → saving → saved on a successful debounced write', async () => {
    const d = deferred<TestDeck>()
    const save = vi.fn(() => d.promise)
    const { coord, onSaved } = setup({ save })

    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    expect(save).toHaveBeenCalledTimes(1)
    expect(coord.getView().status).toBe('saving')

    d.resolve({ id: 'deck-1', updatedAt: 't-final' })
    await coord.flush()

    expect(coord.getView()).toEqual({ status: 'saved', dirty: false, error: null })
    expect(onSaved).toHaveBeenCalledWith('deck-1', 't-final')
  })

  it('never reports saved while newer edits are pending, and saves them next', async () => {
    const save1 = deferred<TestDeck>()
    const save2 = deferred<TestDeck>()
    const save = vi
      .fn<[TestDeck], Promise<TestDeck>>()
      .mockReturnValueOnce(save1.promise)
      .mockReturnValueOnce(save2.promise)
    const { coord, setDeck } = setup({ save })

    const deckA: TestDeck = { id: 'deck-1', updatedAt: 'A' }
    const deckB: TestDeck = { id: 'deck-1', updatedAt: 'B' }

    setDeck(deckA)
    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    expect(save).toHaveBeenNthCalledWith(1, deckA)

    // An edit lands while save #1 is still in flight.
    setDeck(deckB)
    coord.noteEdit()
    expect(coord.getView().status).toBe('saving')
    expect(coord.getView().dirty).toBe(true)

    // Save #1 completes but there are newer edits: must NOT look saved.
    save1.resolve({ ...deckA, updatedAt: 'A-saved' })
    await Promise.resolve()
    await Promise.resolve()
    expect(coord.getView().status).not.toBe('saved')
    expect(coord.getView().dirty).toBe(true)

    // The pending edit is written on the next debounce, with the newest deck.
    vi.advanceTimersByTime(DEBOUNCE)
    expect(save).toHaveBeenNthCalledWith(2, deckB)
    save2.resolve({ ...deckB, updatedAt: 'B-saved' })
    await coord.flush()
    expect(coord.getView()).toEqual({ status: 'saved', dirty: false, error: null })
  })

  it('flush persists pending edits immediately, bypassing the debounce', async () => {
    const { coord, save } = setup()
    coord.noteEdit()
    // Timer still pending — flush should not wait for it.
    await coord.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(coord.getView().status).toBe('saved')

    // The debounce timer must have been cancelled — no second write later.
    vi.advanceTimersByTime(DEBOUNCE * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush while a save is in flight waits for it, then writes the newest edits', async () => {
    const save1 = deferred<TestDeck>()
    const save2 = deferred<TestDeck>()
    const save = vi
      .fn<[TestDeck], Promise<TestDeck>>()
      .mockReturnValueOnce(save1.promise)
      .mockReturnValueOnce(save2.promise)
    const { coord, setDeck } = setup({ save })

    const deckA: TestDeck = { id: 'deck-1', updatedAt: 'A' }
    const deckB: TestDeck = { id: 'deck-1', updatedAt: 'B' }

    setDeck(deckA)
    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    expect(save).toHaveBeenNthCalledWith(1, deckA)

    setDeck(deckB)
    coord.noteEdit()

    const flushed = coord.flush()
    save1.resolve({ ...deckA, updatedAt: 'A-saved' })
    await Promise.resolve()
    save2.resolve({ ...deckB, updatedAt: 'B-saved' })
    await flushed

    expect(save).toHaveBeenNthCalledWith(2, deckB)
    expect(coord.getView()).toEqual({ status: 'saved', dirty: false, error: null })
  })

  it('flush with nothing pending is a no-op', async () => {
    const { coord, save } = setup()
    const view = await coord.flush()
    expect(save).not.toHaveBeenCalled()
    expect(view).toEqual({ status: 'idle', dirty: false, error: null })
  })

  it('sets an error and never reports saved when the write fails', async () => {
    const save = vi.fn(async () => {
      throw new Error('disk full')
    })
    const { coord, onSaved } = setup({ save })

    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    await coord.flush()

    const view = coord.getView()
    expect(view.status).toBe('error')
    expect(view.error?.message).toContain('disk full')
    expect(view.dirty).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('flush stops (no infinite loop) when the write keeps failing', async () => {
    const save = vi.fn(async () => {
      throw new Error('nope')
    })
    const { coord } = setup({ save })
    coord.noteEdit()
    const view = await coord.flush()
    expect(view.status).toBe('error')
    // A single failed attempt — flush must not spin retrying forever.
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('retry after a failure attempts the write again and can succeed', async () => {
    const save = vi
      .fn<[TestDeck], Promise<TestDeck>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ id: 'deck-1', updatedAt: 't-ok' })
    const { coord } = setup({ save })

    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    await coord.flush()
    expect(coord.getView().status).toBe('error')

    await coord.retry()
    expect(save).toHaveBeenCalledTimes(2)
    expect(coord.getView()).toEqual({ status: 'saved', dirty: false, error: null })
  })

  it('a fresh edit after a failure re-arms the debounce and can recover', async () => {
    const save = vi
      .fn<[TestDeck], Promise<TestDeck>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ id: 'deck-1', updatedAt: 't-ok' })
    const { coord } = setup({ save })

    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    await coord.flush()
    expect(coord.getView().status).toBe('error')

    coord.noteEdit()
    vi.advanceTimersByTime(DEBOUNCE)
    await coord.flush()
    expect(coord.getView().status).toBe('saved')
  })

  it('does not write when there is no deck to save', async () => {
    const { coord, save } = setup({ getDeck: () => null })
    coord.noteEdit()
    await coord.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('dispose cancels a pending debounce so no further writes happen', () => {
    const { coord, save } = setup()
    coord.noteEdit()
    coord.dispose()
    vi.advanceTimersByTime(DEBOUNCE * 2)
    expect(save).not.toHaveBeenCalled()
  })

  it('reset returns to a clean idle state and cancels pending writes (e.g. switching decks)', () => {
    const { coord, save, onChange } = setup()
    coord.noteEdit()
    expect(coord.getView().dirty).toBe(true)

    coord.reset()
    expect(coord.getView()).toEqual({ status: 'idle', dirty: false, error: null })
    expect(onChange).toHaveBeenLastCalledWith({ status: 'idle', dirty: false, error: null })

    // The previous deck's pending debounce must not fire after a reset.
    vi.advanceTimersByTime(DEBOUNCE * 2)
    expect(save).not.toHaveBeenCalled()
  })

  it('reset clears a prior error so a freshly opened deck does not inherit it', async () => {
    const save = vi.fn(async () => {
      throw new Error('old failure')
    })
    const { coord } = setup({ save })
    coord.noteEdit()
    await coord.flush()
    expect(coord.getView().status).toBe('error')

    coord.reset()
    expect(coord.getView().status).toBe('idle')
    expect(coord.getView().error).toBeNull()
  })
})

describe('applySavedTimestamp', () => {
  it('patches only updatedAt on the current deck, preserving newer content', () => {
    const current = { id: 'deck-1', updatedAt: 'old', content: 'newest edit' }
    const next = applySavedTimestamp(current, 'deck-1', 'fresh')
    expect(next).toEqual({ id: 'deck-1', updatedAt: 'fresh', content: 'newest edit' })
    expect(next).not.toBe(current)
  })

  it('ignores a stale save that names a different deck', () => {
    const current = { id: 'deck-2', updatedAt: 'x', content: 'b' }
    expect(applySavedTimestamp(current, 'deck-1', 'fresh')).toBe(current)
  })

  it('returns the same reference when the timestamp is unchanged', () => {
    const current = { id: 'deck-1', updatedAt: 'same' }
    expect(applySavedTimestamp(current, 'deck-1', 'same')).toBe(current)
  })

  it('passes through null', () => {
    expect(applySavedTimestamp(null, 'deck-1', 'fresh')).toBeNull()
  })
})
