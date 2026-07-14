import { describe, it, expect } from 'vitest'
import type { CueCard, Deck } from '../src/shared/types'
import { CURRENT_SCHEMA_VERSION } from '../src/shared/types'
import { evaluateReadiness, groupIssuesByCard } from '../src/shared/readiness'

function makeCard(overrides: Partial<CueCard> = {}): CueCard {
  return {
    id: overrides.id ?? 'card-1',
    title: overrides.title ?? 'A step',
    notes: overrides.notes ?? 'Some talking points',
    snippets: overrides.snippets ?? []
  }
}

function makeDeck(cards: CueCard[], variables: Record<string, string> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    cards,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables
  }
}

describe('readiness: no-steps (deck-level)', () => {
  it('flags an empty deck with a single deck-level issue', () => {
    const result = evaluateReadiness(makeDeck([]))

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({
      code: 'no-steps',
      severity: 'warning',
      cardId: null,
      cardIndex: -1,
      focusTarget: null
    })
    expect(result.issues[0].message).toMatch(/no steps/i)
    expect(result.totalSteps).toBe(0)
    expect(result.readyStepCount).toBe(0)
    expect(result.stepsWithIssuesCount).toBe(0)
  })
})

describe('readiness: untitled-step', () => {
  it('flags a step with an empty title', () => {
    const deck = makeDeck([makeCard({ title: '' })])

    const result = evaluateReadiness(deck)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'untitled-step',
        severity: 'warning',
        cardId: 'card-1',
        cardIndex: 0,
        focusTarget: 'title'
      })
    ])
    expect(result.issues[0].message).toBe('Step 1 has no title.')
  })

  it('flags a whitespace-only title the same as empty', () => {
    const deck = makeDeck([makeCard({ title: '   \n\t ' })])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).toContain('untitled-step')
  })

  it('does not flag a step with a real title', () => {
    const deck = makeDeck([makeCard({ title: 'Intro' })])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).not.toContain('untitled-step')
  })
})

describe('readiness: low-content-step', () => {
  it('flags a step with no notes and no snippets', () => {
    const deck = makeDeck([makeCard({ notes: '', snippets: [] })])

    const result = evaluateReadiness(deck)

    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'low-content-step', cardIndex: 0, focusTarget: 'title' })
    ])
  })

  it('flags a step whose notes are whitespace-only and has no snippets', () => {
    const deck = makeDeck([makeCard({ notes: '   ', snippets: [] })])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).toContain('low-content-step')
  })

  it('flags a step whose only snippets have blank content', () => {
    const deck = makeDeck([
      makeCard({
        notes: '',
        snippets: [
          { id: 's1', label: 'Empty', content: '' },
          { id: 's2', label: 'Also empty', content: '   ' }
        ]
      })
    ])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).toContain('low-content-step')
  })

  it('does not flag a step that has notes but no snippets', () => {
    const deck = makeDeck([makeCard({ notes: 'Say hello', snippets: [] })])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).not.toContain('low-content-step')
  })

  it('does not flag a step that has a usable snippet but no notes', () => {
    const deck = makeDeck([
      makeCard({ notes: '', snippets: [{ id: 's1', label: 'Email', content: 'demo@example.com' }] })
    ])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).not.toContain('low-content-step')
  })
})

describe('readiness: missing-variable', () => {
  it('flags a variable referenced by a snippet with no value in the deck map', () => {
    const deck = makeDeck(
      [
        makeCard({
          notes: 'x',
          snippets: [{ id: 's1', label: 'Greeting', content: 'Hello {{name}}' }]
        })
      ],
      {}
    )

    const result = evaluateReadiness(deck)

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'missing-variable',
        cardIndex: 0,
        focusTarget: 'variables',
        variableName: 'name'
      })
    ])
    expect(result.issues[0].message).toContain('{{name}}')
  })

  it('flags a variable that is present but empty/whitespace-only', () => {
    const deck = makeDeck(
      [makeCard({ notes: 'x', snippets: [{ id: 's1', label: 'Greeting', content: '{{name}}' }] })],
      { name: '   ' }
    )

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).toContain('missing-variable')
  })

  it('does not flag a variable that has a real value', () => {
    const deck = makeDeck(
      [makeCard({ notes: 'x', snippets: [{ id: 's1', label: 'Greeting', content: 'Hello {{name}}' }] })],
      { name: 'Ada' }
    )

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).not.toContain('missing-variable')
  })

  it('treats an undefined deck.variables map as no variables set (v1 decks)', () => {
    const deck: Deck = {
      id: 'deck-1',
      name: 'V1 Deck',
      cards: [
        makeCard({ notes: 'x', snippets: [{ id: 's1', label: 'Greeting', content: 'Hi {{name}}' }] })
      ],
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      schemaVersion: 1
      // variables intentionally omitted
    }

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).toContain('missing-variable')
  })

  it('reports one issue per distinct missing variable, in first-seen order, deduped across snippets', () => {
    const deck = makeDeck([
      makeCard({
        notes: 'x',
        snippets: [
          { id: 's1', label: 'A', content: '{{beta}} and {{alpha}}' },
          { id: 's2', label: 'B', content: '{{alpha}} again and {{gamma}}' }
        ]
      })
    ])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.variableName)).toEqual(['beta', 'alpha', 'gamma'])
  })

  it('ignores invalid-looking placeholders (not real variable references)', () => {
    const deck = makeDeck([
      makeCard({ notes: 'x', snippets: [{ id: 's1', label: 'A', content: '{{ }} and {{a b}}' }] })
    ])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => i.code)).not.toContain('missing-variable')
  })
})

describe('readiness: a fully ready step has no issues', () => {
  it('produces zero issues for a titled step with notes, content, and filled variables', () => {
    const deck = makeDeck(
      [
        makeCard({
          title: 'Intro',
          notes: 'Welcome the audience',
          snippets: [{ id: 's1', label: 'Email', content: 'Contact: {{email}}' }]
        })
      ],
      { email: 'demo@example.com' }
    )

    const result = evaluateReadiness(deck)

    expect(result.issues).toEqual([])
    expect(result.readyStepCount).toBe(1)
    expect(result.stepsWithIssuesCount).toBe(0)
    expect(result.totalSteps).toBe(1)
  })
})

describe('readiness: stable ordering and counts across multiple steps', () => {
  it('orders deck-level, then per-step in running order, then untitled/low-content/missing-variable within a step', () => {
    const deck = makeDeck([
      makeCard({ id: 'c1', title: '', notes: '', snippets: [] }), // untitled + low-content
      makeCard({
        id: 'c2',
        title: 'Demo',
        notes: '',
        snippets: [{ id: 's1', label: 'Link', content: '{{url}}' }]
      }), // missing-variable only
      makeCard({ id: 'c3', title: 'Wrap-up', notes: 'Thanks!', snippets: [] }) // ready
    ])

    const result = evaluateReadiness(deck)

    expect(result.issues.map((i) => [i.cardId, i.code])).toEqual([
      ['c1', 'untitled-step'],
      ['c1', 'low-content-step'],
      ['c2', 'missing-variable']
    ])
    expect(result.totalSteps).toBe(3)
    expect(result.stepsWithIssuesCount).toBe(2)
    expect(result.readyStepCount).toBe(1)
  })

  it('is deterministic: evaluating the same deck twice yields identical results', () => {
    const deck = makeDeck([
      makeCard({ id: 'c1', title: '', notes: '', snippets: [] }),
      makeCard({
        id: 'c2',
        title: 'Demo',
        notes: '',
        snippets: [{ id: 's1', label: 'Link', content: '{{url}} {{token}}' }]
      })
    ])

    const first = evaluateReadiness(deck)
    const second = evaluateReadiness(deck)

    expect(second).toEqual(first)
  })

  it('never mutates the input deck', () => {
    const deck = makeDeck([makeCard({ title: '', notes: '', snippets: [] })])
    const snapshot = JSON.parse(JSON.stringify(deck))

    evaluateReadiness(deck)

    expect(deck).toEqual(snapshot)
  })
})

describe('readiness: groupIssuesByCard', () => {
  it('groups issues by cardId, preserving per-card order', () => {
    const deck = makeDeck([
      makeCard({ id: 'c1', title: '', notes: '', snippets: [] }),
      makeCard({ id: 'c2', title: 'Fine', notes: 'ok', snippets: [] })
    ])
    const { issues } = evaluateReadiness(deck)

    const grouped = groupIssuesByCard(issues)

    expect(grouped.get('c1')?.map((i) => i.code)).toEqual(['untitled-step', 'low-content-step'])
    expect(grouped.has('c2')).toBe(false)
  })

  it('excludes deck-level issues (null cardId) from the grouping', () => {
    const { issues } = evaluateReadiness(makeDeck([]))

    const grouped = groupIssuesByCard(issues)

    expect(grouped.size).toBe(0)
  })

  it('returns an empty map for no issues', () => {
    expect(groupIssuesByCard([]).size).toBe(0)
  })
})
