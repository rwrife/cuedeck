/**
 * Pure, DOM-free deck-readiness evaluator for Rehearse mode (#36).
 *
 * Rehearse answers "am I ready to present?" by computing a deterministic
 * preflight from the current in-memory {@link Deck} — never persisted, never
 * mutating the deck. This module is the single source of truth for what
 * counts as a readiness concern so the evaluator can be unit-tested without
 * React, Zustand, or Electron, and so the Rehearse UI only has to render what
 * this function returns.
 *
 * ## What's checked
 *
 *  - `no-steps` — the deck has no steps at all (deck-level; no single step to
 *    link to).
 *  - `untitled-step` — a step's title is empty/whitespace-only.
 *  - `low-content-step` — a step has neither talking points nor any
 *    paste-ready content with real (non-blank) text — nothing useful to say
 *    or hand out during that beat.
 *  - `missing-variable` — a step's paste-ready content references a
 *    `{{variable}}` (see `@shared/variables`) that has no value in the deck's
 *    variable map, so it would render the visible "unfilled" marker if
 *    copied/dragged right now.
 *
 * Every issue is a `'warning'`: Rehearse informs, it never blocks presenting
 * (see the design spec's Rehearse + Feedback and Error Handling sections).
 *
 * ## Ordering
 *
 * Issues are returned in a single stable order: deck-level issues first (only
 * ever `no-steps`, and only when there are no steps), then per step in
 * running-order (`cardIndex`), and within a step: `untitled-step`, then
 * `low-content-step`, then one `missing-variable` issue per referenced
 * variable in first-seen order (matching `extractVariableNames`/
 * `classifyVariables`). This makes the evaluator's output — and therefore any
 * UI list built from it — deterministic across runs for the same deck.
 */

import type { CueCard, Deck, DeckVariables } from './types'
import { classifyVariables } from './variables'

/** Discriminates the kind of readiness concern. */
export type ReadinessIssueCode =
  | 'no-steps'
  | 'untitled-step'
  | 'low-content-step'
  | 'missing-variable'

/**
 * Severity of a readiness issue. Only `'warning'` exists today — Rehearse
 * issues never block Present — but the field is kept typed/explicit so a
 * future distinct severity (e.g. a purely informational note) doesn't
 * require reshaping every consumer.
 */
export type ReadinessSeverity = 'warning'

/**
 * Where a "fix this" navigation from Rehearse should land focus once it's
 * back in Build, so the concern is easy to act on immediately:
 *
 *  - `'title'` — focus/select the step's title field (mirrors the existing
 *    `focusCardId` "focus new content" mechanism).
 *  - `'variables'` — expand the deck-level Variables disclosure in Build's
 *    Advanced area (mirrors `focusCardId` with a dedicated one-shot flag).
 *  - `null` — no single field applies (e.g. the deck has no steps yet); just
 *    switching to Build is the whole fix.
 */
export type ReadinessFocusTarget = 'title' | 'variables' | null

/** One deterministic, actionable readiness concern. */
export interface ReadinessIssue {
  code: ReadinessIssueCode
  severity: ReadinessSeverity
  /** Human-readable explanation of the concern, ready to display as-is. */
  message: string
  /** The step this concerns, or `null` for a deck-level issue (`no-steps`). */
  cardId: string | null
  /** Zero-based position of the step in the running order, or `-1` for a deck-level issue. */
  cardIndex: number
  /** Which field/area a "fix this" navigation should focus in Build. */
  focusTarget: ReadinessFocusTarget
  /** The unfilled variable name, present only for `missing-variable` issues. */
  variableName?: string
}

/** Full result of evaluating a deck's readiness. */
export interface ReadinessResult {
  /** Every issue found, in the stable order documented above. */
  issues: ReadinessIssue[]
  /** Total number of steps in the deck. */
  totalSteps: number
  /** Steps with zero readiness issues. */
  readyStepCount: number
  /** Distinct steps that have at least one issue (deck-level issues excluded). */
  stepsWithIssuesCount: number
}

/** True when `value` is empty or made up only of whitespace. */
function isBlank(value: string): boolean {
  return value.trim().length === 0
}

/** A step's own "untitled" / "low content" issues (order matters; see module docs). */
function structuralIssues(card: CueCard, cardIndex: number): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  const label = card.title.trim() || 'Untitled step'

  if (isBlank(card.title)) {
    issues.push({
      code: 'untitled-step',
      severity: 'warning',
      message: `Step ${cardIndex + 1} has no title.`,
      cardId: card.id,
      cardIndex,
      focusTarget: 'title'
    })
  }

  const hasNotes = !isBlank(card.notes)
  const hasUsableSnippet = card.snippets.some((s) => !isBlank(s.content))
  if (!hasNotes && !hasUsableSnippet) {
    issues.push({
      code: 'low-content-step',
      severity: 'warning',
      message: `Step ${cardIndex + 1} (${label}) has no talking points or paste-ready content yet.`,
      cardId: card.id,
      cardIndex,
      focusTarget: 'title'
    })
  }

  return issues
}

/** One `missing-variable` issue per unfilled `{{variable}}` referenced by the step, in first-seen order. */
function missingVariableIssues(
  card: CueCard,
  cardIndex: number,
  variables: DeckVariables
): ReadinessIssue[] {
  const label = card.title.trim() || 'Untitled step'
  // Reuse the shared variable engine's own reference scan/dedup by evaluating
  // it over the step's snippet contents joined together — the same pure logic
  // that drives the editor's "uses…" chips and copy/drag substitution, so
  // Rehearse's notion of "missing" can never drift from what actually renders.
  const combinedContent = card.snippets.map((s) => s.content).join('\n')
  const { missing } = classifyVariables(combinedContent, variables)

  return missing.map((name) => ({
    code: 'missing-variable' as const,
    severity: 'warning' as const,
    message: `Step ${cardIndex + 1} (${label}) references {{${name}}}, which has no value.`,
    cardId: card.id,
    cardIndex,
    focusTarget: 'variables' as const,
    variableName: name
  }))
}

/**
 * Compute the deterministic readiness preflight for `deck`. Pure and
 * synchronous: never mutates `deck`, never reads/writes any persisted state.
 */
export function evaluateReadiness(deck: Deck): ReadinessResult {
  const variables = deck.variables ?? {}

  if (deck.cards.length === 0) {
    return {
      issues: [
        {
          code: 'no-steps',
          severity: 'warning',
          message: 'This deck has no steps yet — add one in Build before presenting.',
          cardId: null,
          cardIndex: -1,
          focusTarget: null
        }
      ],
      totalSteps: 0,
      readyStepCount: 0,
      stepsWithIssuesCount: 0
    }
  }

  const issues: ReadinessIssue[] = []
  let stepsWithIssuesCount = 0

  deck.cards.forEach((card, cardIndex) => {
    const cardIssues = [
      ...structuralIssues(card, cardIndex),
      ...missingVariableIssues(card, cardIndex, variables)
    ]
    if (cardIssues.length > 0) stepsWithIssuesCount += 1
    issues.push(...cardIssues)
  })

  return {
    issues,
    totalSteps: deck.cards.length,
    readyStepCount: deck.cards.length - stepsWithIssuesCount,
    stepsWithIssuesCount
  }
}

/** Convenience: issues for a single step, keyed for O(1) lookup by the UI. */
export function groupIssuesByCard(issues: readonly ReadinessIssue[]): Map<string, ReadinessIssue[]> {
  const byCard = new Map<string, ReadinessIssue[]>()
  for (const issue of issues) {
    if (!issue.cardId) continue
    const existing = byCard.get(issue.cardId)
    if (existing) existing.push(issue)
    else byCard.set(issue.cardId, [issue])
  }
  return byCard
}
