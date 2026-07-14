import { describe, it, expect } from 'vitest'
import type { DeckSummary } from '../src/shared/types'
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  NEW_DEMO_CHOICES,
  blankDemoDeck,
  filterSummaries,
  firstStepCard,
  isLibrarySort,
  queryLibrary,
  sortSummaries,
  starterTemplateDeck
} from '../src/shared/library'
import { validateDeck } from '../src/shared/deck'
import { CURRENT_SCHEMA_VERSION } from '../src/shared/types'

function summary(partial: Partial<DeckSummary> & { id: string }): DeckSummary {
  return {
    name: partial.id,
    filePath: `/decks/${partial.id}.json`,
    cardCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial
  }
}

const decks: DeckSummary[] = [
  summary({ id: 'a', name: 'Marketing Launch', updatedAt: '2026-03-01T00:00:00.000Z', cardCount: 5 }),
  summary({ id: 'b', name: 'API Onboarding', updatedAt: '2026-05-01T00:00:00.000Z', cardCount: 2 }),
  summary({ id: 'c', name: 'Quarterly Review', updatedAt: '2026-01-15T00:00:00.000Z', cardCount: 9 })
]

describe('library: sort vocabulary', () => {
  it('defaults to recently-updated', () => {
    expect(DEFAULT_LIBRARY_SORT).toBe('recent')
    expect(LIBRARY_SORTS[0].sort).toBe('recent')
  })

  it('every sort option has a label', () => {
    for (const o of LIBRARY_SORTS) expect(o.label.length).toBeGreaterThan(0)
  })

  it('recognizes only known sorts', () => {
    expect(isLibrarySort('recent')).toBe(true)
    expect(isLibrarySort('name')).toBe(true)
    expect(isLibrarySort('cards')).toBe(true)
    expect(isLibrarySort('oldest')).toBe(true)
    expect(isLibrarySort('nope')).toBe(false)
    expect(isLibrarySort(null)).toBe(false)
  })
})

describe('library: sortSummaries', () => {
  it('does not mutate the input', () => {
    const before = decks.map((d) => d.id)
    sortSummaries(decks, 'name')
    expect(decks.map((d) => d.id)).toEqual(before)
  })

  it('orders by most recent update', () => {
    expect(sortSummaries(decks, 'recent').map((d) => d.id)).toEqual(['b', 'a', 'c'])
  })

  it('orders by oldest update', () => {
    expect(sortSummaries(decks, 'oldest').map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('orders by name A–Z', () => {
    expect(sortSummaries(decks, 'name').map((d) => d.name)).toEqual([
      'API Onboarding',
      'Marketing Launch',
      'Quarterly Review'
    ])
  })

  it('orders by most cards', () => {
    expect(sortSummaries(decks, 'cards').map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('breaks ties by name then id', () => {
    const tied: DeckSummary[] = [
      summary({ id: 'z', name: 'Same', updatedAt: '2026-01-01T00:00:00.000Z', cardCount: 1 }),
      summary({ id: 'a', name: 'Same', updatedAt: '2026-01-01T00:00:00.000Z', cardCount: 1 })
    ]
    expect(sortSummaries(tied, 'recent').map((d) => d.id)).toEqual(['a', 'z'])
  })
})

describe('library: filter + query', () => {
  it('returns everything for an empty query', () => {
    expect(filterSummaries(decks, '   ')).toHaveLength(3)
  })

  it('fuzzy-matches deck names', () => {
    expect(filterSummaries(decks, 'mkt lnch').map((d) => d.id)).toEqual(['a'])
    expect(filterSummaries(decks, 'api').map((d) => d.id)).toEqual(['b'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterSummaries(decks, 'zzzzz')).toEqual([])
  })

  it('queryLibrary filters then sorts', () => {
    const both: DeckSummary[] = [
      summary({ id: 'a', name: 'Onboarding A', updatedAt: '2026-01-01T00:00:00.000Z' }),
      summary({ id: 'b', name: 'Onboarding B', updatedAt: '2026-02-01T00:00:00.000Z' })
    ]
    expect(queryLibrary(both, 'onboarding', 'recent').map((d) => d.id)).toEqual(['b', 'a'])
    expect(queryLibrary(both, 'onboarding', 'name').map((d) => d.id)).toEqual(['a', 'b'])
  })
})

describe('library: new demo choices', () => {
  it('offers blank, template, and import with explanatory copy', () => {
    expect(NEW_DEMO_CHOICES.map((c) => c.choice)).toEqual(['blank', 'template', 'import'])
    for (const c of NEW_DEMO_CHOICES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.description.length).toBeGreaterThan(0)
    }
  })
})

describe('library: starter content', () => {
  it('first-step card is focused, not empty, with a fresh id', () => {
    const a = firstStepCard()
    const b = firstStepCard()
    expect(a.title.length).toBeGreaterThan(0)
    expect(a.notes.length).toBeGreaterThan(0)
    expect(a.id).not.toBe(b.id)
  })

  it('blank demo is a valid deck that already has a first card', () => {
    const deck = blankDemoDeck('My Demo')
    expect(deck.name).toBe('My Demo')
    expect(deck.cards).toHaveLength(1)
    expect(deck.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(validateDeck(deck).ok).toBe(true)
  })

  it('starter template is a valid multi-card teaching deck', () => {
    const deck = starterTemplateDeck()
    expect(deck.cards.length).toBeGreaterThanOrEqual(3)
    // At least one snippet exists to demonstrate paste-ready content.
    expect(deck.cards.some((c) => c.snippets.length > 0)).toBe(true)
    expect(validateDeck(deck).ok).toBe(true)
    // Fresh ids per call.
    expect(starterTemplateDeck().id).not.toBe(deck.id)
  })
})
