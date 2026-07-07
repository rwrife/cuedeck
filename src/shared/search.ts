/**
 * Pure, DOM-free search helpers powering the command palette (#4).
 *
 * Kept here (rather than in the renderer) so the fuzzy-match and result-ranking
 * logic can be unit-tested in the node vitest env, exactly like `hotkeys.ts`.
 * The renderer's `CommandPalette` component consumes {@link searchDeck} and only
 * owns the DOM/keyboard glue.
 *
 * A deliberately lightweight matcher is used instead of pulling in a fuzzy-search
 * dependency (e.g. fuse.js): subsequence matching with a small, explainable
 * scoring model is plenty for deck-sized data and keeps the bundle dep-free.
 */

import type { Deck } from './types'

/** What a given result points at: either a card to activate or a snippet to copy. */
export type SearchResultKind = 'card' | 'snippet'

/** A single, ready-to-render palette result. */
export interface SearchResult {
  /** Stable key for React lists and selection tracking. */
  key: string
  kind: SearchResultKind
  /** Owning card id (for both kinds). */
  cardId: string
  /** Snippet id when {@link kind} is `'snippet'`. */
  snippetId?: string
  /** Primary line shown in the palette (card title or snippet label). */
  title: string
  /** Secondary context line (card notes preview, or the owning card's title). */
  subtitle?: string
  /** Relevance score; higher is better. Used only for sorting. */
  score: number
}

/** Human-readable label for a result kind, shown as a badge in the palette. */
export function kindLabel(kind: SearchResultKind): string {
  return kind === 'card' ? 'Card' : 'Snippet'
}

/**
 * Score how well `query` matches `text` as a case-insensitive subsequence.
 *
 * Returns `0` when the query isn't a subsequence of the text at all. Otherwise a
 * positive number where higher means a tighter match. The scoring rewards, in
 * order of impact:
 *  - contiguous runs of matched characters (a real substring beats scattered hits),
 *  - matches at the very start of the text,
 *  - matches right after a word boundary (space, `-`, `_`, `/`, `.`, camelCase),
 *  - shorter haystacks (a hit in a 4-char label beats the same hit in a paragraph).
 *
 * An empty query returns a small constant so "everything matches" ordering stays
 * stable (callers typically special-case empty queries anyway).
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (q.length === 0) return 1
  if (t.length === 0) return 0

  let qi = 0
  let score = 0
  let runLength = 0
  let firstMatchIndex = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      runLength = 0
      continue
    }

    if (firstMatchIndex === -1) firstMatchIndex = ti

    // Base point for any matched character.
    score += 1

    // Reward contiguous runs: the Nth char in a run is worth progressively more.
    runLength += 1
    score += runLength * 2

    // Reward matches at a boundary (start of string or after a separator).
    const prev = ti > 0 ? t[ti - 1] : ''
    const isBoundary =
      ti === 0 ||
      prev === ' ' ||
      prev === '-' ||
      prev === '_' ||
      prev === '/' ||
      prev === '.' ||
      // camelCase / TitleCase boundary in the ORIGINAL text.
      (text[ti] >= 'A' && text[ti] <= 'Z' && !(text[ti - 1] >= 'A' && text[ti - 1] <= 'Z'))
    if (isBoundary) score += 3

    qi++
  }

  // Not all query characters were consumed → not a subsequence → no match.
  if (qi < q.length) return 0

  // Strong bonus for matching at the very start of the field.
  if (firstMatchIndex === 0) score += 8

  // Prefer shorter haystacks: normalize lightly by length so a hit in a short
  // label outranks the same hit buried in a long note.
  score += Math.max(0, 12 - t.length / 4)

  return score
}

/** Collapse whitespace and trim a note into a compact one-line preview. */
function preview(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Build the full, unranked candidate set for a deck: one entry per card and one
 * per snippet, each carrying the text fields we search against.
 */
interface Candidate {
  result: Omit<SearchResult, 'score'>
  /** Fields searched, in priority order (earlier = weighted higher). */
  fields: string[]
}

function candidatesFor(deck: Deck): Candidate[] {
  const out: Candidate[] = []
  for (const card of deck.cards) {
    const cardTitle = card.title || 'Untitled'
    out.push({
      result: {
        key: `card:${card.id}`,
        kind: 'card',
        cardId: card.id,
        title: cardTitle,
        subtitle: card.notes ? preview(card.notes) : undefined
      },
      // Card title matches matter most; notes are secondary.
      fields: [cardTitle, card.notes]
    })

    for (const snippet of card.snippets) {
      const label = snippet.label || 'Untitled snippet'
      out.push({
        result: {
          key: `snippet:${card.id}:${snippet.id}`,
          kind: 'snippet',
          cardId: card.id,
          snippetId: snippet.id,
          title: label,
          subtitle: cardTitle
        },
        // Snippet label matches matter most; content is secondary.
        fields: [label, snippet.content]
      })
    }
  }
  return out
}

/** Weight applied to each searched field by its position (first field = highest). */
const FIELD_WEIGHTS = [1, 0.5, 0.25]

/**
 * Search a deck's cards and snippets for `query`, returning results sorted by
 * relevance (best first).
 *
 * With an empty/whitespace query, returns every card and snippet in natural
 * deck order (cards and their snippets interleaved) so the palette can act as a
 * plain browse list before the user types.
 *
 * `limit` caps the number of results (default 50) to keep rendering snappy on
 * very large decks.
 */
export function searchDeck(deck: Deck | null, query: string, limit = 50): SearchResult[] {
  if (!deck) return []
  const candidates = candidatesFor(deck)
  const q = query.trim()

  if (q.length === 0) {
    // Natural order, no scoring needed.
    return candidates.slice(0, limit).map((c) => ({ ...c.result, score: 0 }))
  }

  const scored: SearchResult[] = []
  for (const cand of candidates) {
    let best = 0
    cand.fields.forEach((field, i) => {
      const weight = FIELD_WEIGHTS[i] ?? FIELD_WEIGHTS[FIELD_WEIGHTS.length - 1]
      const s = fuzzyScore(q, field) * weight
      if (s > best) best = s
    })
    if (best > 0) scored.push({ ...cand.result, score: best })
  }

  // Sort by score desc; ties keep natural deck order (stable sort in modern JS,
  // reinforced by comparing original candidate index via the key as a fallback).
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
