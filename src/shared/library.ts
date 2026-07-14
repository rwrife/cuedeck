/**
 * Pure, DOM-free helpers for the CueDeck Library and first-run creation flow
 * (#34).
 *
 * The Library is the app's landing surface: it lists the user's decks with
 * useful metadata, supports search + sorting, and offers a guided "New Demo"
 * flow (blank demo, starter template, or import). Everything here is
 * dependency-light and Electron/DOM-free so the search/sort logic and the
 * starter-template content can be unit-tested in the node vitest env and reused
 * by the renderer, main, and CLI without drift.
 *
 * The rendering (DeckPicker) lives in the renderer; the deck persistence side
 * effects live in the main process. This module owns only the small pieces of
 * logic worth testing in isolation.
 */

import { fuzzyScore } from './search'
import type { Deck, DeckSummary } from './types'
import { createEmptyDeck, generateId } from './deck'

/* -------------------------------------------------------------------------- */
/* Library sorting                                                            */
/* -------------------------------------------------------------------------- */

/** How the Library list may be ordered. */
export type LibrarySort = 'recent' | 'oldest' | 'name' | 'cards'

/** Human metadata for each sort option, in the order they appear in the UI. */
export interface LibrarySortInfo {
  readonly sort: LibrarySort
  readonly label: string
}

/** Ordered sort options surfaced in the Library sort control. */
export const LIBRARY_SORTS: readonly LibrarySortInfo[] = [
  { sort: 'recent', label: 'Recently updated' },
  { sort: 'oldest', label: 'Oldest first' },
  { sort: 'name', label: 'Name (A–Z)' },
  { sort: 'cards', label: 'Most cards' }
] as const

/** The default Library ordering (most recently touched first). */
export const DEFAULT_LIBRARY_SORT: LibrarySort = 'recent'

/** True when `value` is a recognized {@link LibrarySort}. */
export function isLibrarySort(value: unknown): value is LibrarySort {
  return (
    value === 'recent' || value === 'oldest' || value === 'name' || value === 'cards'
  )
}

/**
 * Order a list of deck summaries by the requested sort. Returns a new array and
 * never mutates the input. Ordering is total and stable: ties fall back to a
 * case-insensitive name compare, then id, so the list never reshuffles
 * arbitrarily between renders.
 */
export function sortSummaries(
  summaries: readonly DeckSummary[],
  sort: LibrarySort
): DeckSummary[] {
  const byName = (a: DeckSummary, b: DeckSummary): number =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)

  const copy = summaries.slice()
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || byName(a, b))
    case 'name':
      return copy.sort(byName)
    case 'cards':
      return copy.sort((a, b) => b.cardCount - a.cardCount || byName(a, b))
    case 'recent':
    default:
      return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b))
  }
}

/* -------------------------------------------------------------------------- */
/* Library search                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Filter deck summaries by a free-text query against the deck name, preserving
 * the caller's incoming order. An empty/whitespace query returns the list
 * unchanged (a plain browse list). Matching reuses the shared subsequence
 * {@link fuzzyScore}, so "mkt lnch" still finds "Marketing Launch".
 */
export function filterSummaries(
  summaries: readonly DeckSummary[],
  query: string
): DeckSummary[] {
  const q = query.trim()
  if (q.length === 0) return summaries.slice()
  return summaries.filter((s) => fuzzyScore(q, s.name) > 0)
}

/**
 * Convenience: filter then sort in one call, matching the Library's render
 * pipeline (search narrows the set, the sort control orders what remains).
 */
export function queryLibrary(
  summaries: readonly DeckSummary[],
  query: string,
  sort: LibrarySort
): DeckSummary[] {
  return sortSummaries(filterSummaries(summaries, query), sort)
}

/* -------------------------------------------------------------------------- */
/* First-run creation flow                                                    */
/* -------------------------------------------------------------------------- */

/** The three ways a user can start a new demo from the Library. */
export type NewDemoChoice = 'blank' | 'template' | 'import'

/** Human-facing metadata for a New Demo choice, used to explain what happens. */
export interface NewDemoChoiceInfo {
  readonly choice: NewDemoChoice
  readonly label: string
  /** One line explaining exactly what picking this option will do. */
  readonly description: string
}

/**
 * The New Demo choices, in the order they appear in the guided flow, each with
 * copy that explains the outcome BEFORE the user commits (acceptance criteria:
 * "Starter-template and import choices explain what will happen").
 */
export const NEW_DEMO_CHOICES: readonly NewDemoChoiceInfo[] = [
  {
    choice: 'blank',
    label: 'Blank demo',
    description: 'Start empty and land on a focused first card, ready to write your opening beat.'
  },
  {
    choice: 'template',
    label: 'Starter template',
    description:
      'Begin from a ready-made deck of example cards and paste-ready snippets you can rename or delete.'
  },
  {
    choice: 'import',
    label: 'Import a deck',
    description:
      'Load a deck from a .cuedeck.json file. It is copied into your Library so the original file is left untouched.'
  }
] as const

/**
 * The single starter card a freshly created *blank* demo opens on, so the user
 * lands on a focused first step instead of an inert empty editor (acceptance
 * criteria). Ids are assigned fresh per call so two blank demos never collide.
 */
export function firstStepCard(): Deck['cards'][number] {
  return {
    id: generateId(),
    title: 'Opening',
    notes:
      'Write your first beat here. Cards are the steps of your demo; ' +
      'add paste-ready snippets to each card to copy text into your app while you present.',
    snippets: []
  }
}

/**
 * Build a fresh blank demo: a normal empty deck that already contains the
 * focused {@link firstStepCard}. The main process seeds new decks with this so
 * `createDeck` can hand the renderer a deck whose first card is ready to edit.
 */
export function blankDemoDeck(name: string): Deck {
  const deck = createEmptyDeck(name)
  return { ...deck, cards: [firstStepCard()] }
}

/**
 * The built-in starter template: a small, self-explanatory deck that teaches
 * decks, cards, and paste-ready snippets by example. Ids are freshly generated
 * per call. Used by the "Starter template" New Demo choice.
 */
export function starterTemplateDeck(name = 'Starter Demo'): Deck {
  const deck = createEmptyDeck(name)
  return {
    ...deck,
    cards: [
      {
        id: generateId(),
        title: 'Welcome',
        notes:
          '**This is a card** — one step of your demo.\n\n' +
          'Read your talking points from here while you present. ' +
          'Edit this text in the Build workspace, or delete this template and start fresh.',
        snippets: []
      },
      {
        id: generateId(),
        title: 'Paste-ready snippets',
        notes:
          'Snippets are labeled bits of text you copy with one click (or a number key) ' +
          'and paste into the app you are demoing — no fumbling for the right string on stage.',
        snippets: [
          { id: generateId(), label: 'Demo email', content: 'demo.user@example.com' },
          { id: generateId(), label: 'Sample API key', content: 'sk-demo-0000-1111-2222' }
        ]
      },
      {
        id: generateId(),
        title: 'Go live',
        notes:
          'When you are ready, switch to **Rehearse** to practice the running order, ' +
          'then **Present** for the compact, always-on-top view that floats over your demo.',
        snippets: []
      }
    ]
  }
}
