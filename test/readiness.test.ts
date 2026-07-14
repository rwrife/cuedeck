import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type CueCard, type Deck, type Snippet } from '../src/shared/types'
import {
  LOW_CONTENT_NOTE_THRESHOLD,
  evaluateReadiness,
  summarizeReadiness,
  type ReadinessWarningKind
} from '../src/shared/readiness'

/** Build a snippet with sane defaults. */
function snippet(over: Partial<Snippet> = {}): Snippet {
  return { id: `s-${Math.random().toString(36).slice(2)}`, label: 'Block', content: 'ok', ...over }
}

/** Build a card with sane defaults (title + enough notes to avoid low-content). */
function card(over: Partial<CueCard> = {}): CueCard {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    title: 'A step title',
    notes: 'These are talking points with plenty of substance.',
    snippets: [],
    ...over
  }
}

/** Build a deck from a list of cards + optional variables. */
function deck(cards: CueCard[], variables?: Record<string, string>): Deck {
  return {
    id: 'deck-1',
    name: 'Deck',
    cards,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables
  }
}

describe('readiness: clean decks', () => {
  it('reports ready with no warnings for a fully-authored deck', () => {
    const report = evaluateReadiness(deck([card(), card({ snippets: [snippet()] })]))
    expect(report.ready).toBe(true)
    expect(report.warnings).toHaveLength(0)
  })
})

describe('readiness: empty titles', () => {
  it('flags a step with a blank title', () => {
    const report = evaluateReadiness(deck([card({ title: '   ' })]))
    expect(report.ready).toBe(false)
    expect(report.warnings).toHaveLength(1)
    const [w] = report.warnings
    expect(w.kind).toBe<ReadinessWarningKind>('empty-title')
    expect(w.fix.target).toBe('step')
    expect(w.cardIndex).toBe(0)
    expect(w.message).toContain('Step 1')
  })

  it('links the fix to the offending card id', () => {
    const c = card({ title: '' })
    const report = evaluateReadiness(deck([c]))
    expect(report.warnings[0].fix).toEqual({ target: 'step', cardId: c.id })
  })
})

describe('readiness: low content', () => {
  it('flags a step with no snippets and near-empty notes', () => {
    const report = evaluateReadiness(deck([card({ notes: 'hi', snippets: [] })]))
    expect(report.warnings.some((w) => w.kind === 'low-content')).toBe(true)
  })

  it('does not flag low content when the step has snippets', () => {
    const report = evaluateReadiness(deck([card({ notes: '', snippets: [snippet()] })]))
    expect(report.warnings.some((w) => w.kind === 'low-content')).toBe(false)
  })

  it('does not flag low content when notes meet the threshold', () => {
    const notes = 'x'.repeat(LOW_CONTENT_NOTE_THRESHOLD)
    const report = evaluateReadiness(deck([card({ notes, snippets: [] })]))
    expect(report.warnings.some((w) => w.kind === 'low-content')).toBe(false)
  })
})

describe('readiness: missing variables', () => {
  it('flags a referenced variable with no value', () => {
    const report = evaluateReadiness(
      deck([card({ snippets: [snippet({ content: 'Hello {{name}}' })] })], {})
    )
    const missing = report.warnings.filter((w) => w.kind === 'missing-variable')
    expect(missing).toHaveLength(1)
    expect(missing[0].fix).toEqual({ target: 'variable', name: 'name' })
    expect(missing[0].message).toContain('name')
  })

  it('does not flag a referenced variable that has a value', () => {
    const report = evaluateReadiness(
      deck([card({ snippets: [snippet({ content: 'Hello {{name}}' })] })], { name: 'Ada' })
    )
    expect(report.warnings.some((w) => w.kind === 'missing-variable')).toBe(false)
  })

  it('treats a whitespace-only value as missing', () => {
    const report = evaluateReadiness(
      deck([card({ snippets: [snippet({ content: '{{name}}' })] })], { name: '   ' })
    )
    expect(report.warnings.some((w) => w.kind === 'missing-variable')).toBe(true)
  })

  it('reports a variable used by multiple steps exactly once', () => {
    const report = evaluateReadiness(
      deck(
        [
          card({ snippets: [snippet({ content: '{{shared}}' })] }),
          card({ snippets: [snippet({ content: 'again {{shared}}' })] })
        ],
        {}
      )
    )
    const missing = report.warnings.filter((w) => w.kind === 'missing-variable')
    expect(missing).toHaveLength(1)
    // Attributed to the first step that references it.
    expect(missing[0].cardIndex).toBe(0)
  })
})

describe('readiness: determinism & ordering', () => {
  it('produces identical output across repeated runs', () => {
    const d = deck(
      [
        card({ title: '', snippets: [snippet({ content: '{{a}}' })] }),
        card({ notes: '', snippets: [] })
      ],
      {}
    )
    const first = evaluateReadiness(d)
    const second = evaluateReadiness(d)
    expect(second.warnings.map((w) => w.id)).toEqual(first.warnings.map((w) => w.id))
  })

  it('orders warnings by running order then category', () => {
    const d = deck(
      [
        // Step 1: empty title + missing variable (title before variable).
        card({ id: 'c1', title: '', snippets: [snippet({ content: '{{v}}' })] }),
        // Step 2: low content.
        card({ id: 'c2', notes: '', snippets: [] })
      ],
      {}
    )
    const kinds = evaluateReadiness(d).warnings.map((w) => w.kind)
    expect(kinds).toEqual(['empty-title', 'missing-variable', 'low-content'])
  })

  it('gives every warning a unique, stable id', () => {
    const d = deck(
      [card({ title: '', notes: '', snippets: [] })],
      {}
    )
    const ids = evaluateReadiness(d).warnings.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('empty-title:' + d.cards[0].id)
    expect(ids).toContain('low-content:' + d.cards[0].id)
  })
})

describe('readiness: purity', () => {
  it('does not mutate the deck', () => {
    const d = deck([card({ title: '' })], {})
    const snapshot = JSON.parse(JSON.stringify(d))
    evaluateReadiness(d)
    expect(d).toEqual(snapshot)
  })
})

describe('readiness: summarize', () => {
  it('counts warnings by kind', () => {
    const d = deck(
      [
        card({ title: '', snippets: [snippet({ content: '{{a}}' })] }),
        card({ notes: '', snippets: [] })
      ],
      {}
    )
    const counts = summarizeReadiness(evaluateReadiness(d))
    expect(counts['empty-title']).toBe(1)
    expect(counts['missing-variable']).toBe(1)
    expect(counts['low-content']).toBe(1)
  })
})
