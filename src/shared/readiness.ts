/**
 * Deck-readiness evaluation (#36) — the pure, DOM-free engine that runs a
 * deterministic "preflight" over a deck before the user rehearses or presents.
 *
 * Like the rest of `src/shared`, this module is plain data logic with no DOM,
 * Electron, React, or Zustand dependency, so it can be unit-tested in the plain
 * Node test environment and reused identically by the app, CLI, and MCP server.
 *
 * ## Design contract
 *
 * - **Derived, never persisted.** Readiness is computed on demand from the deck.
 *   Nothing here mutates the deck, and the results are not written back into the
 *   deck file — they exist only to inform the presenter.
 * - **Deterministic.** For a given deck the same warnings come out in the same
 *   stable order every time, so the results can be unit-tested and rendered
 *   without flicker. Warnings are ordered by running order (card index), then by
 *   a fixed per-card category order.
 * - **Informs, does not block.** Warnings explain a concern and point at the
 *   exact Build location that resolves them; they never prevent the user from
 *   starting Present.
 *
 * The renderer maps each {@link ReadinessFix} onto a concrete navigation into
 * the Build workspace (focus the offending step, or open the deck variables), so
 * every warning is a one-click path to the fix.
 */

import type { Deck } from './types'
import { extractVariableNames } from './variables'

/**
 * A minimum non-whitespace character count below which a step's talking points
 * are considered "low content". A step with fewer meaningful note characters
 * than this (and no snippets to fall back on) earns a low-content warning, since
 * it will give the presenter little to say when they land on it live.
 *
 * Exported so tests and callers can reason about the threshold explicitly.
 */
export const LOW_CONTENT_NOTE_THRESHOLD = 12

/** The category of a readiness warning. Stable, machine-readable. */
export type ReadinessWarningKind = 'empty-title' | 'missing-variable' | 'low-content'

/**
 * A pointer to the exact Build location that resolves a warning. A discriminated
 * union so the renderer can navigate precisely without the evaluator knowing
 * anything about the UI:
 *
 * - `step` — focus a specific step (cue card) in the Build workspace.
 * - `variable` — open the deck variables and focus a specific variable value.
 */
export type ReadinessFix =
  | { readonly target: 'step'; readonly cardId: string }
  | { readonly target: 'variable'; readonly name: string }

/** A single, human-readable readiness concern about a deck. */
export interface ReadinessWarning {
  /**
   * Stable, deterministic identifier for this warning, unique within a report.
   * Safe to use as a React key and to assert in tests. Encodes the kind plus the
   * offending entity (card id / variable name).
   */
  readonly id: string
  /** Machine-readable category. */
  readonly kind: ReadinessWarningKind
  /**
   * One-line explanation of the concern, written for the presenter (no internal
   * jargon). Explains *why* it matters, not just *what* is missing.
   */
  readonly message: string
  /** Where in Build to go to resolve this warning. */
  readonly fix: ReadinessFix
  /**
   * The 0-based running-order index of the step this warning relates to, or
   * `null` for deck-wide concerns (e.g. a missing variable value). Used only for
   * stable ordering + optional display; never persisted.
   */
  readonly cardIndex: number | null
}

/**
 * The full, derived readiness report for a deck. `ready` is a convenience flag
 * meaning "no warnings"; a deck can still be presented when `ready` is false.
 */
export interface ReadinessReport {
  /** True when the deck has zero warnings. Presenting is allowed either way. */
  readonly ready: boolean
  /** All warnings, in deterministic order. */
  readonly warnings: readonly ReadinessWarning[]
}

/** True for a string that is empty or only whitespace. */
function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0
}

/** A short, human label for a step used inside warning messages. */
function stepLabel(index: number): string {
  return `Step ${index + 1}`
}

/**
 * Evaluate a deck's readiness for rehearsal / presentation.
 *
 * Produces a deterministic list of warnings across three categories:
 *
 * 1. **empty-title** — a step with no title. It will show as "Untitled" live and
 *    is hard to find in the running order.
 * 2. **low-content** — a step with neither meaningful talking points nor any
 *    paste-ready content, so there is nothing to say or paste when you land on it.
 * 3. **missing-variable** — a `{{variable}}` referenced by a snippet whose deck
 *    value is unset/blank, so it will paste a visible ⟦placeholder⟧ marker live.
 *
 * Ordering: warnings are grouped by running order (card index), and within a
 * card by the fixed category order above; deck-wide missing-variable warnings
 * (a variable can be referenced by several steps) are attributed to the first
 * step that references them so they sit next to where they bite. The function is
 * pure and never mutates `deck`.
 */
export function evaluateReadiness(deck: Deck): ReadinessReport {
  const warnings: ReadinessWarning[] = []
  const values = deck.variables ?? {}

  // Track missing variables we've already reported so a variable referenced by
  // several steps is surfaced exactly once, attributed to its first use.
  const reportedMissingVars = new Set<string>()

  deck.cards.forEach((card, index) => {
    // 1. Empty title.
    if (isBlank(card.title)) {
      warnings.push({
        id: `empty-title:${card.id}`,
        kind: 'empty-title',
        message: `${stepLabel(index)} has no title, so it will show as “Untitled” and be hard to find in your running order.`,
        fix: { target: 'step', cardId: card.id },
        cardIndex: index
      })
    }

    // 2. Low content: nothing meaningful to say and nothing to paste.
    const noteChars = card.notes.trim().length
    const hasSnippets = card.snippets.length > 0
    if (!hasSnippets && noteChars < LOW_CONTENT_NOTE_THRESHOLD) {
      warnings.push({
        id: `low-content:${card.id}`,
        kind: 'low-content',
        message: `${stepLabel(index)} has little talking points and no paste-ready content, so there will be nothing to say or paste when you reach it.`,
        fix: { target: 'step', cardId: card.id },
        cardIndex: index
      })
    }

    // 3. Missing variable values referenced by this step's snippets. Attribute
    //    the first sighting to this step so the fix links to a real location.
    for (const snippet of card.snippets) {
      for (const name of extractVariableNames(snippet.content)) {
        if (reportedMissingVars.has(name)) continue
        if (!isBlank(values[name])) continue
        reportedMissingVars.add(name)
        warnings.push({
          id: `missing-variable:${name}`,
          kind: 'missing-variable',
          message: `Variable “${name}” (used in ${stepLabel(index)}) has no value, so it will paste a visible ⟦${name}⟧ placeholder instead of real text.`,
          fix: { target: 'variable', name },
          cardIndex: index
        })
      }
    }
  })

  // Stable sort by running order, then by a fixed category order within a card.
  const kindOrder: Record<ReadinessWarningKind, number> = {
    'empty-title': 0,
    'low-content': 1,
    'missing-variable': 2
  }
  const ordered = warnings
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const ai = a.w.cardIndex ?? Number.MAX_SAFE_INTEGER
      const bi = b.w.cardIndex ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      const ak = kindOrder[a.w.kind]
      const bk = kindOrder[b.w.kind]
      if (ak !== bk) return ak - bk
      return a.i - b.i // preserve first-seen order for ties (e.g. two vars)
    })
    .map(({ w }) => w)

  return { ready: ordered.length === 0, warnings: ordered }
}

/**
 * Count warnings by kind. Small helper for summary UIs ("2 steps, 1 variable")
 * and for asserting shape in tests without walking the array.
 */
export function summarizeReadiness(
  report: ReadinessReport
): Record<ReadinessWarningKind, number> {
  const counts: Record<ReadinessWarningKind, number> = {
    'empty-title': 0,
    'low-content': 0,
    'missing-variable': 0
  }
  for (const w of report.warnings) counts[w.kind] += 1
  return counts
}
