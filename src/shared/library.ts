/**
 * Pure, DOM-free helpers powering the Library surface (#34): collection
 * search/sort, new-deck-name validation, duplicate-name suggestion, and the
 * "starter template" deck used by the guided New Demo flow's second choice.
 *
 * Kept here — rather than in the renderer — so every behavior is unit-tested
 * without React, Zustand, or Electron, matching the convention already
 * established by `workspace.ts`, `search.ts`, and `reorder.ts`.
 */

import type { CueCard, Deck, DeckSummary, DeckVariables, Snippet } from './types'
import { fuzzyScore } from './search'
import { generateId } from './deck'

/** How the Library's deck collection can be ordered. */
export type LibrarySortKey = 'updated' | 'name'

export const LIBRARY_SORT_KEYS: readonly LibrarySortKey[] = ['updated', 'name']

/** Human label for a sort key, for the sort control. */
export function librarySortLabel(key: LibrarySortKey): string {
  return key === 'updated' ? 'Recently updated' : 'Name'
}

/**
 * Sort deck summaries for display. `'updated'` orders most-recently-updated
 * first (a fresh ISO timestamp string sorts correctly with plain comparison);
 * `'name'` orders alphabetically, case-insensitively. Always returns a new
 * array — the input is never mutated, so callers can sort derived state
 * safely.
 */
export function sortDecks(summaries: DeckSummary[], key: LibrarySortKey): DeckSummary[] {
  const copy = [...summaries]
  if (key === 'name') {
    return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }
  return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Filter deck summaries by a search query against the deck name, using the
 * same lightweight subsequence scorer as the in-deck command palette
 * ({@link fuzzyScore}) so search behaves consistently across the app.
 *
 * An empty/whitespace query returns every summary, unchanged order (so the
 * Library's default view is just its current sort, with no re-ranking).
 */
export function filterDecksByQuery(summaries: DeckSummary[], query: string): DeckSummary[] {
  const q = query.trim()
  if (q.length === 0) return [...summaries]

  return summaries
    .map((s) => ({ summary: s, score: fuzzyScore(q, s.name) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.summary)
}

/** Result of validating a candidate deck name (create or rename). */
export type DeckNameValidation = { ok: true; name: string } | { ok: false; error: string }

/**
 * Validate a candidate deck name for create/rename, trimming surrounding
 * whitespace. The only hard rule is "not blank" — decks don't otherwise
 * constrain names — so invalid input always gets one clear, actionable
 * message rather than silently reverting (Feedback and Error Handling).
 */
export function validateDeckName(name: string): DeckNameValidation {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Give this deck a name.' }
  }
  return { ok: true, name: trimmed }
}

/**
 * Suggest a non-colliding name for a duplicated deck: "<name> copy", then
 * "<name> copy 2", "<name> copy 3", … the first suffix not already present in
 * `existingNames`. Pure so the main-process duplicate handler and its tests
 * don't need a real filesystem to exercise the naming rule.
 */
export function suggestCopyName(name: string, existingNames: string[]): string {
  const taken = new Set(existingNames)
  const base = `${name} copy`
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/* -------------------------------------------------------------------------- */
/* Starter template                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Deck-level variables seeded by the starter template, teaching
 * `{{placeholder}}` substitution with an already-filled-in example.
 */
export const STARTER_TEMPLATE_VARIABLES: DeckVariables = {
  customer: 'Acme'
}

/** Plain-data shape for one starter-template card, before ids are assigned. */
interface TemplateCardSeed {
  title: string
  notes: string
  snippets: { label: string; content: string }[]
}

/**
 * The starter template's content: three short steps that teach the core
 * model (a step's title + talking points + paste-ready snippets) using
 * generic, safely-reusable demo copy. Deliberately small — this is a
 * "useful small sample," not a full example deck.
 */
const TEMPLATE_CARD_SEEDS: readonly TemplateCardSeed[] = [
  {
    title: 'Welcome & goal',
    notes:
      'Set the stage: who this demo is for and what {{customer}} will see by the end. ' +
      'This talking-point area supports Markdown — headings, bold/italic, and lists.',
    snippets: [{ label: 'Demo login', content: 'demo@example.com' }]
  },
  {
    title: 'Show the core feature',
    notes:
      "Walk through the one thing {{customer}} came to see. Each snippet below is " +
      'paste-ready — click it any time during a demo to copy its content to the clipboard.',
    snippets: [{ label: 'Sample value', content: 'Paste this into the app to show it live.' }]
  },
  {
    title: 'Wrap up & next steps',
    notes: 'Recap what you showed and offer one clear next step for {{customer}}.',
    snippets: []
  }
]

/**
 * Build fresh {@link CueCard}s for the starter template, assigning new ids
 * via `idFactory` (defaults to the app-wide {@link generateId}) so every
 * call — and every deck created from the template — gets unique ids.
 */
export function buildStarterTemplateCards(idFactory: () => string = generateId): CueCard[] {
  return TEMPLATE_CARD_SEEDS.map((seed) => {
    const snippets: Snippet[] = seed.snippets.map((s) => ({
      id: idFactory(),
      label: s.label,
      content: s.content
    }))
    const card: CueCard = {
      id: idFactory(),
      title: seed.title,
      notes: seed.notes,
      snippets
    }
    return card
  })
}

/**
 * Apply the starter template onto an existing deck: fills its `cards` and
 * `variables`, but preserves the deck's `id`, `name`, `createdAt`, and
 * `schemaVersion` untouched. Used right after creating a fresh empty deck, so
 * the persisted deck format never changes — this only ever produces an
 * ordinary, valid {@link Deck}.
 */
export function applyStarterTemplate(deck: Deck, idFactory: () => string = generateId): Deck {
  return {
    ...deck,
    cards: buildStarterTemplateCards(idFactory),
    variables: { ...STARTER_TEMPLATE_VARIABLES, ...deck.variables }
  }
}
