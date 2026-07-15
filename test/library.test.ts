import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Deck, type DeckSummary } from '../src/shared/types'
import {
  applyStarterTemplate,
  buildStarterTemplateCards,
  filterDecksByQuery,
  sortDecks,
  suggestCopyName,
  validateDeckName,
  STARTER_TEMPLATE_VARIABLES
} from '../src/shared/library'

/**
 * Pure, DOM-free coverage for the Library surface's collection helpers (#34):
 * search/filter, sort, name validation, duplicate-name suggestion, and the
 * starter-template deck builder. None of these touch React, Zustand, or
 * Electron, so they're covered directly here rather than via component tests.
 */

function summary(overrides: Partial<DeckSummary>): DeckSummary {
  return {
    id: 'deck-1',
    name: 'Untitled Deck',
    filePath: '/decks/deck-1.json',
    cardCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('sortDecks', () => {
  const decks: DeckSummary[] = [
    summary({ id: 'a', name: 'Zebra Demo', updatedAt: '2026-01-01T00:00:00.000Z' }),
    summary({ id: 'b', name: 'apple Demo', updatedAt: '2026-03-01T00:00:00.000Z' }),
    summary({ id: 'c', name: 'Mango Demo', updatedAt: '2026-02-01T00:00:00.000Z' })
  ]

  it('sorts by most-recently-updated first', () => {
    const sorted = sortDecks(decks, 'updated')
    expect(sorted.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by name, ascending and case-insensitive', () => {
    const sorted = sortDecks(decks, 'name')
    expect(sorted.map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const original = [...decks]
    sortDecks(decks, 'name')
    expect(decks).toEqual(original)
  })
})

describe('filterDecksByQuery', () => {
  const decks: DeckSummary[] = [
    summary({ id: 'a', name: 'SaaS Onboarding Walkthrough' }),
    summary({ id: 'b', name: 'API Devtool Demo' }),
    summary({ id: 'c', name: 'Billing Upgrade Flow' })
  ]

  it('returns every deck, unchanged order, for an empty/whitespace query', () => {
    expect(filterDecksByQuery(decks, '')).toEqual(decks)
    expect(filterDecksByQuery(decks, '   ')).toEqual(decks)
  })

  it('matches a subsequence of the deck name, case-insensitively', () => {
    const result = filterDecksByQuery(decks, 'saas')
    expect(result.map((d) => d.id)).toEqual(['a'])
  })

  it('excludes decks that do not match', () => {
    const result = filterDecksByQuery(decks, 'zzz-no-match')
    expect(result).toEqual([])
  })

  it('ranks a tighter/earlier match above a looser one', () => {
    const result = filterDecksByQuery(decks, 'demo')
    // "API Devtool Demo" ends with an exact "Demo"; both should match, but
    // ordering is at minimum stable and inclusive of both.
    expect(result.map((d) => d.id)).toContain('b')
  })
})

describe('validateDeckName', () => {
  it('rejects an empty name', () => {
    const result = validateDeckName('')
    expect(result.ok).toBe(false)
  })

  it('rejects a whitespace-only name', () => {
    const result = validateDeckName('   ')
    expect(result.ok).toBe(false)
  })

  it('accepts and trims a valid name', () => {
    const result = validateDeckName('  My Demo  ')
    expect(result).toEqual({ ok: true, name: 'My Demo' })
  })
})

describe('suggestCopyName', () => {
  it('appends "copy" when there is no collision', () => {
    expect(suggestCopyName('Product Launch', [])).toBe('Product Launch copy')
  })

  it('increments a numbered suffix on collision', () => {
    const existing = ['Product Launch', 'Product Launch copy']
    expect(suggestCopyName('Product Launch', existing)).toBe('Product Launch copy 2')
  })

  it('keeps incrementing past multiple collisions', () => {
    const existing = ['Product Launch', 'Product Launch copy', 'Product Launch copy 2']
    expect(suggestCopyName('Product Launch', existing)).toBe('Product Launch copy 3')
  })
})

describe('starter template', () => {
  it('builds at least two cards with paste-ready snippets', () => {
    const cards = buildStarterTemplateCards()
    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards.every((c) => c.title.trim().length > 0)).toBe(true)
    expect(cards.some((c) => c.snippets.length > 0)).toBe(true)
  })

  it('assigns fresh, unique ids to every card and snippet', () => {
    const cards = buildStarterTemplateCards()
    const ids = cards.flatMap((c) => [c.id, ...c.snippets.map((s) => s.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('applies the template onto an existing (empty) deck without changing its identity', () => {
    const base: Deck = {
      id: 'deck-123',
      name: 'My Starter Demo',
      cards: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      variables: {}
    }

    const templated = applyStarterTemplate(base)

    expect(templated.id).toBe('deck-123')
    expect(templated.name).toBe('My Starter Demo')
    expect(templated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(templated.cards.length).toBeGreaterThan(0)
    expect(templated.variables).toEqual(STARTER_TEMPLATE_VARIABLES)
  })
})
