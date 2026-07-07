import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Deck } from '../src/shared/types'
import { fuzzyScore, kindLabel, searchDeck, type SearchResult } from '../src/shared/search'

/**
 * Tests for the command-palette search layer (#4). These exercise the pure,
 * DOM-free logic the renderer relies on: subsequence scoring and deck-wide
 * result building/ranking.
 */

/** Build a minimal but well-formed deck fixture for search tests. */
function makeDeck(): Deck {
  return {
    id: 'deck-1',
    name: 'Demo Deck',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cards: [
      {
        id: 'c1',
        title: 'Intro & Setup',
        notes: 'Welcome the audience and open the dashboard.',
        snippets: [
          { id: 's1', label: 'Login email', content: 'demo@example.com' },
          { id: 's2', label: 'API token', content: 'sk-test-abc123' }
        ]
      },
      {
        id: 'c2',
        title: 'Billing Flow',
        notes: 'Show the upgrade path and the invoice.',
        snippets: [{ id: 's3', label: 'Coupon code', content: 'SAVE20' }]
      },
      {
        id: 'c3',
        title: 'Wrap Up',
        notes: '',
        snippets: []
      }
    ]
  }
}

describe('search: fuzzyScore', () => {
  it('returns 0 when the query is not a subsequence', () => {
    expect(fuzzyScore('zzz', 'Billing Flow')).toBe(0)
    expect(fuzzyScore('flowx', 'Billing Flow')).toBe(0)
  })

  it('matches a contiguous substring', () => {
    expect(fuzzyScore('bill', 'Billing Flow')).toBeGreaterThan(0)
  })

  it('matches a scattered subsequence but scores it lower than a contiguous run', () => {
    const scattered = fuzzyScore('blg', 'Billing Flow') // b..l..g
    const contiguous = fuzzyScore('bil', 'Billing Flow')
    expect(scattered).toBeGreaterThan(0)
    expect(contiguous).toBeGreaterThan(scattered)
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('BILL', 'billing')).toBe(fuzzyScore('bill', 'billing'))
  })

  it('rewards start-of-string matches over mid-string matches', () => {
    const atStart = fuzzyScore('flow', 'flow chart')
    const midString = fuzzyScore('flow', 'the flow chart')
    expect(atStart).toBeGreaterThan(midString)
  })

  it('rewards a hit in a short field over the same hit in a long field', () => {
    const short = fuzzyScore('api', 'API token')
    const long = fuzzyScore('api', 'this is a very long note that mentions the api somewhere')
    expect(short).toBeGreaterThan(long)
  })

  it('treats an empty query as a trivial match and empty text as no match', () => {
    expect(fuzzyScore('', 'anything')).toBeGreaterThan(0)
    expect(fuzzyScore('x', '')).toBe(0)
  })
})

describe('search: kindLabel', () => {
  it('labels card and snippet kinds', () => {
    expect(kindLabel('card')).toBe('Card')
    expect(kindLabel('snippet')).toBe('Snippet')
  })
})

describe('search: searchDeck', () => {
  it('returns every card and snippet in natural order for an empty query', () => {
    const results = searchDeck(makeDeck(), '')
    // 3 cards + 3 snippets = 6 entries.
    expect(results).toHaveLength(6)
    expect(results.map((r) => r.key)).toEqual([
      'card:c1',
      'snippet:c1:s1',
      'snippet:c1:s2',
      'card:c2',
      'snippet:c2:s3',
      'card:c3'
    ])
  })

  it('returns [] for a null deck', () => {
    expect(searchDeck(null, 'anything')).toEqual([])
  })

  it('finds a card by its title', () => {
    const results = searchDeck(makeDeck(), 'billing')
    const top = results[0]
    expect(top.kind).toBe('card')
    expect(top.cardId).toBe('c2')
    expect(top.title).toBe('Billing Flow')
  })

  it('finds a snippet by its label', () => {
    const results = searchDeck(makeDeck(), 'coupon')
    const hit = results.find((r) => r.kind === 'snippet')
    expect(hit).toBeDefined()
    expect(hit?.cardId).toBe('c2')
    expect(hit?.snippetId).toBe('s3')
    expect(hit?.subtitle).toBe('Billing Flow') // owning card as context
  })

  it('matches on card notes as a secondary field', () => {
    const results = searchDeck(makeDeck(), 'invoice')
    const hit = results.find((r) => r.kind === 'card' && r.cardId === 'c2')
    expect(hit).toBeDefined()
  })

  it('matches on snippet content as a secondary field', () => {
    const results = searchDeck(makeDeck(), 'SAVE20')
    const hit = results.find((r) => r.kind === 'snippet' && r.snippetId === 's3')
    expect(hit).toBeDefined()
  })

  it('excludes non-matching entries', () => {
    const results = searchDeck(makeDeck(), 'billing')
    expect(results.every((r) => r.score > 0)).toBe(true)
    // "Wrap Up" (c3) should not appear for a "billing" query.
    expect(results.some((r) => r.cardId === 'c3')).toBe(false)
  })

  it('ranks a label match above a mere content/notes match', () => {
    // "token" is the snippet label s2 and does not appear elsewhere strongly.
    const results = searchDeck(makeDeck(), 'token')
    expect(results[0].kind).toBe('snippet')
    expect(results[0].snippetId).toBe('s2')
  })

  it('sorts results by descending score', () => {
    const results = searchDeck(makeDeck(), 'o')
    const scores = results.map((r: SearchResult) => r.score)
    const sorted = [...scores].sort((a, b) => b - a)
    expect(scores).toEqual(sorted)
  })

  it('respects the limit argument', () => {
    const results = searchDeck(makeDeck(), '', 2)
    expect(results).toHaveLength(2)
  })

  it('falls back to "Untitled" labels for blank titles/labels', () => {
    const deck = makeDeck()
    deck.cards[0].title = ''
    deck.cards[0].snippets[0].label = ''
    const results = searchDeck(deck, '')
    expect(results.find((r) => r.key === 'card:c1')?.title).toBe('Untitled')
    expect(results.find((r) => r.key === 'snippet:c1:s1')?.title).toBe('Untitled snippet')
  })
})
