import { describe, it, expect } from 'vitest'

import {
  isModeAvailable,
  modeAfterCloseDeck,
  modeAfterEnterPresent,
  modeAfterExitPresent,
  modeAfterOpenDeck,
  primaryActionMode,
  resolveModeSelection,
  type WorkspaceMode
} from '../src/shared/workspace'
import { evaluateReadiness, groupIssuesByCard } from '../src/shared/readiness'
import {
  positionLabel,
  presenterProgress,
  presenterStepDensity,
  snippetHotkeyLabel
} from '../src/shared/presenter'
import { classifyVariables, renderSnippet, MISSING_VARIABLE_MARKER } from '../src/shared/variables'
import { move } from '../src/shared/reorder'
import { applyStarterTemplate, filterDecksByQuery, sortDecks } from '../src/shared/library'
import { createEmptyDeck } from '../src/shared/deck'
import type { CueCard, Deck, DeckSummary, Snippet } from '../src/shared/types'

/**
 * Cross-mode / derived-workflow coverage for the Studio journey (#39).
 *
 * These are **characterization / integration tests**: they assert the *seams*
 * between the already-shipped pure modules — `workspace` (mode navigation),
 * `readiness` (Rehearse), `presenter` + `variables` (Present rendering),
 * `reorder` (Build), and `library` (first-run) — as a single user would move
 * through them: Library → Build → Rehearse → Present → back to Rehearse. They
 * document and lock in existing behavior across module boundaries that each
 * module's own unit test can't see, so they are expected to pass on the current
 * codebase. They intentionally avoid the renderer/store so they run in the same
 * DOM-free Node Vitest environment as the rest of `src/shared`'s tests.
 */

let idSeq = 0
function id(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}

function snippet(label: string, content: string): Snippet {
  return { id: id('snip'), label, content }
}

function card(title: string, notes: string, snippets: Snippet[] = []): CueCard {
  return { id: id('card'), title, notes, snippets }
}

/** A realistic, mostly-ready demo with one intentional missing-variable gap. */
function sampleDeck(): Deck {
  return {
    ...createEmptyDeck('Acme product tour'),
    variables: { customer: 'Acme', demoEmail: 'ada@acme.example' },
    cards: [
      card('Welcome & sign in', 'Set the stage for **{{customer}}**.', [
        snippet('Demo email', '{{demoEmail}}')
      ]),
      card('Show the core feature', 'Walk through the one thing they came to see.', [
        snippet('Sample value', 'Paste this into the app.')
      ]),
      // References {{seatCount}} which the deck never defines → one warning.
      card('Plan & pricing', 'Anchor on value, then hand out the quote.', [
        snippet('Quote link', 'https://acme.example/quote?seats={{seatCount}}')
      ])
    ]
  }
}

describe('studio workflow: Library → Build → Rehearse → Present → Rehearse mode chain', () => {
  it('derives the whole journey from the pure workspace transitions', () => {
    // Library is the durable home; deck-specific modes are unavailable first.
    let mode: WorkspaceMode = 'library'
    expect(isModeAvailable('build', false)).toBe(false)
    expect(resolveModeSelection('present', mode, false)).toBe('library')

    // Open a deck → Build.
    mode = modeAfterOpenDeck()
    expect(mode).toBe('build')

    // Build's one primary next action is Rehearse.
    const buildNext = primaryActionMode(mode)
    expect(buildNext).toBe('rehearse')
    mode = resolveModeSelection(buildNext!, mode, true)
    expect(mode).toBe('rehearse')

    // Rehearse's one primary next action is Present.
    const rehearseNext = primaryActionMode(mode)
    expect(rehearseNext).toBe('present')
    mode = modeAfterEnterPresent(mode, true)
    expect(mode).toBe('present')

    // Present has no "next mode" — only Exit, which returns to Rehearse.
    expect(primaryActionMode(mode)).toBeNull()
    mode = modeAfterExitPresent(mode)
    expect(mode).toBe('rehearse')

    // Closing the deck drops back to Library.
    mode = modeAfterCloseDeck()
    expect(mode).toBe('library')
  })

  it('keeps the deck-specific modes unreachable from the rail until a deck is open', () => {
    for (const target of ['build', 'rehearse', 'present'] as const) {
      expect(resolveModeSelection(target, 'library', false)).toBe('library')
      expect(resolveModeSelection(target, 'library', true)).toBe(target)
    }
    // Library is always reachable, deck or not.
    expect(resolveModeSelection('library', 'present', true)).toBe('library')
  })
})

describe('studio workflow: Rehearse readiness derives navigable Build fix-links', () => {
  it('flags exactly the intended gap and points every non-deck issue at a real step', () => {
    const deck = sampleDeck()
    const result = evaluateReadiness(deck)

    expect(result.totalSteps).toBe(3)
    expect(result.stepsWithIssuesCount).toBe(1)
    expect(result.readyStepCount).toBe(result.totalSteps - result.stepsWithIssuesCount)

    const cardIds = new Set(deck.cards.map((c) => c.id))
    for (const issue of result.issues) {
      // Every step-scoped fix-link must resolve to a real, navigable card.
      if (issue.cardId !== null) {
        expect(cardIds.has(issue.cardId)).toBe(true)
        expect(deck.cards[issue.cardIndex]?.id).toBe(issue.cardId)
      }
      // The Build focus target is always one the Build workspace understands.
      expect(['title', 'variables', null]).toContain(issue.focusTarget)
    }

    const missing = result.issues.find((i) => i.code === 'missing-variable')
    expect(missing?.variableName).toBe('seatCount')
    expect(missing?.focusTarget).toBe('variables')
  })

  it('resolving the flagged variable in Build clears the Rehearse warning (fix-link round-trip)', () => {
    const deck = sampleDeck()
    const before = evaluateReadiness(deck)
    expect(before.issues.some((i) => i.code === 'missing-variable')).toBe(true)

    // Simulate the user following the fix-link to Variables and filling it in.
    const fixed: Deck = { ...deck, variables: { ...deck.variables, seatCount: '25' } }
    const after = evaluateReadiness(fixed)

    expect(after.issues.some((i) => i.code === 'missing-variable')).toBe(false)
    expect(after.stepsWithIssuesCount).toBe(0)
    expect(after.readyStepCount).toBe(after.totalSteps)
  })

  it('groups issues by card so Build can badge the exact step that needs work', () => {
    const deck = sampleDeck()
    const byCard = groupIssuesByCard(evaluateReadiness(deck).issues)
    // Only the pricing step (index 2) carries a warning.
    expect(byCard.has(deck.cards[2].id)).toBe(true)
    expect(byCard.has(deck.cards[0].id)).toBe(false)
  })
})

describe('studio workflow: Rehearse readiness and Present rendering agree on variables', () => {
  it('a variable Rehearse calls "missing" renders as the visible marker in Present, and filling it fixes both', () => {
    const deck = sampleDeck()
    const pricing = deck.cards[2]
    const content = pricing.snippets[0].content

    // Rehearse's notion of "missing" comes from the same engine Present copies with.
    const { missing } = classifyVariables(content, deck.variables)
    expect(missing).toContain('seatCount')

    // Present would put the unfilled marker on the clipboard, never a raw token.
    const unresolved = renderSnippet(content, deck.variables)
    expect(unresolved).toContain(MISSING_VARIABLE_MARKER('seatCount'))
    expect(unresolved).not.toContain('{{seatCount}}')

    // After the fix, both the warning and the marker are gone.
    const filled = { ...deck.variables, seatCount: '25' }
    expect(classifyVariables(content, filled).missing).toHaveLength(0)
    const resolved = renderSnippet(content, filled)
    expect(resolved).toBe('https://acme.example/quote?seats=25')
    expect(evaluateReadiness({ ...deck, variables: filled }).issues).toHaveLength(0)
  })
})

describe('studio workflow: Present position/progress/density stay consistent across the deck', () => {
  it('labels, progress, and hotkeys advance coherently step by step', () => {
    const deck = sampleDeck()
    const total = deck.cards.length

    let lastProgress = 0
    deck.cards.forEach((_, index) => {
      expect(positionLabel(index, total)).toBe(`${index + 1} / ${total}`)
      const progress = presenterProgress(index, total)
      expect(progress).toBeGreaterThan(lastProgress)
      lastProgress = progress
    })
    // The final step fills the progress bar exactly.
    expect(lastProgress).toBe(1)

    // Only the first nine paste actions get a number badge.
    expect(snippetHotkeyLabel(0)).toBe('1')
    expect(snippetHotkeyLabel(8)).toBe('9')
    expect(snippetHotkeyLabel(9)).toBeNull()
  })

  it('classifies sparse vs content-heavy steps so the compact window adapts', () => {
    const sparse = card('Q&A', '')
    const heavy = card('Deep dive', 'x'.repeat(900), [snippet('a', 'v'), snippet('b', 'v')])
    expect(presenterStepDensity({ notesLength: sparse.notes.length, snippetCount: sparse.snippets.length })).toBe(
      'sparse'
    )
    expect(presenterStepDensity({ notesLength: heavy.notes.length, snippetCount: heavy.snippets.length })).toBe(
      'full'
    )
  })
})

describe('studio workflow: Build reordering flows through to Present navigation', () => {
  it('moving a step changes its Present position label and progress', () => {
    const deck = sampleDeck()
    const total = deck.cards.length
    const lastTitle = deck.cards[total - 1].title

    // Drag the final step to the front in Build.
    const reordered = move(deck.cards, total - 1, 0)
    expect(reordered[0].title).toBe(lastTitle)

    // In Present, that same step is now "1 / N" at the start of the bar.
    const newIndex = reordered.findIndex((c) => c.title === lastTitle)
    expect(newIndex).toBe(0)
    expect(positionLabel(newIndex, total)).toBe(`1 / ${total}`)
    expect(presenterProgress(newIndex, total)).toBeCloseTo(1 / total)
  })
})

describe('studio workflow: Library first-run feeds a readiness-checkable Build deck', () => {
  it('a starter-template demo opens to Build and rehearses cleanly', () => {
    const deck = applyStarterTemplate(createEmptyDeck('My first demo'))
    // Opening any created deck lands on Build.
    expect(modeAfterOpenDeck()).toBe('build')

    const result = evaluateReadiness(deck)
    // The starter template ships filled-in {{customer}} and real content, so it
    // is presentable with no readiness warnings out of the box.
    expect(result.totalSteps).toBeGreaterThan(0)
    expect(result.issues).toHaveLength(0)
    expect(result.readyStepCount).toBe(result.totalSteps)
  })

  it('Library search and sort compose over the same collection', () => {
    const summaries: DeckSummary[] = [
      { id: 'a', name: 'Acme product tour', filePath: 'a', cardCount: 6, updatedAt: '2026-07-14T16:40:00.000Z' },
      { id: 'b', name: 'API integration demo', filePath: 'b', cardCount: 3, updatedAt: '2026-07-11T14:20:00.000Z' },
      { id: 'c', name: 'Quarterly roadmap review', filePath: 'c', cardCount: 2, updatedAt: '2026-06-28T10:05:00.000Z' }
    ]

    // Default sort is most-recently-updated first.
    expect(sortDecks(summaries, 'updated').map((s) => s.id)).toEqual(['a', 'b', 'c'])
    // Name sort is alphabetical, case-insensitive.
    expect(sortDecks(summaries, 'name').map((s) => s.name)).toEqual([
      'Acme product tour',
      'API integration demo',
      'Quarterly roadmap review'
    ])
    // Filtering then sorting narrows to matches while preserving a stable order.
    const filtered = sortDecks(filterDecksByQuery(summaries, 'demo'), 'updated')
    expect(filtered.map((s) => s.id)).toEqual(['b'])
  })
})
