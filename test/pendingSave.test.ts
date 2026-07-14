import { describe, it, expect, vi } from 'vitest'
import { flushPendingSave } from '../src/shared/pendingSave'
import type { Deck } from '../src/shared/types'

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Demo',
    cards: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    schemaVersion: 2,
    variables: {},
    ...overrides
  }
}

describe('pendingSave: flushPendingSave', () => {
  it('does nothing when no save is pending', async () => {
    const save = vi.fn()
    const cancelPendingSave = vi.fn()

    const result = await flushPendingSave(makeDeck(), {
      hasPendingSave: () => false,
      cancelPendingSave,
      save
    })

    expect(result).toBeNull()
    expect(cancelPendingSave).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('does nothing when no deck is loaded, even if a save were (implausibly) pending', async () => {
    const save = vi.fn()

    const result = await flushPendingSave(null, {
      hasPendingSave: () => true,
      cancelPendingSave: vi.fn(),
      save
    })

    expect(result).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('cancels the scheduled timer and immediately persists the deck when a save is pending', async () => {
    const deck = makeDeck({ name: 'Edited mid-debounce' })
    const saved = { ...deck, updatedAt: '2024-01-02T00:00:00.000Z' }
    const cancelPendingSave = vi.fn()
    const save = vi.fn().mockResolvedValue(saved)

    const result = await flushPendingSave(deck, {
      hasPendingSave: () => true,
      cancelPendingSave,
      save
    })

    expect(cancelPendingSave).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(deck)
    expect(result).toEqual(saved)
  })

  it('cancels before persisting, so the debounce timer can never race the immediate save', async () => {
    const deck = makeDeck()
    const order: string[] = []
    const cancelPendingSave = vi.fn(() => order.push('cancel'))
    const save = vi.fn(async (d: Deck) => {
      order.push('save')
      return d
    })

    await flushPendingSave(deck, { hasPendingSave: () => true, cancelPendingSave, save })

    expect(order).toEqual(['cancel', 'save'])
  })
})
