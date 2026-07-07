/**
 * Shared domain types for CueDeck.
 * Used by both the main (Electron) and renderer (React) processes.
 */

/** A single labeled blob of text the user copies/drags into a demo target app. */
export interface Snippet {
  id: string
  /** Short human label shown on the copy button, e.g. "Test email". */
  label: string
  /** The actual text placed on the clipboard / dragged out. */
  content: string
}

/** One step/beat in a demo. Holds talking-point notes and 0..N snippets. */
export interface CueCard {
  id: string
  title: string
  /** Freeform talking points / script for this beat. Plain text (markdown-friendly). */
  notes: string
  snippets: Snippet[]
}

/** A full demo script. Persisted as a single JSON file. */
export interface Deck {
  id: string
  name: string
  cards: CueCard[]
  /** ISO timestamp of creation. */
  createdAt: string
  /** ISO timestamp of last modification. */
  updatedAt: string
  /** Schema version for future migrations. */
  schemaVersion: number
}

/** Lightweight deck descriptor for the deck-picker list. */
export interface DeckSummary {
  id: string
  name: string
  filePath: string
  cardCount: number
  updatedAt: string
}

export const CURRENT_SCHEMA_VERSION = 1
