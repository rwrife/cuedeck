/**
 * Shared domain types for CueDeck.
 * Used by both the main (Electron) and renderer (React) processes.
 *
 * These TypeScript types are the AUTHORITATIVE source of truth for the deck
 * model. The published JSON Schema (schema/cuedeck.schema.json) and the shared
 * validator (src/shared/deck.ts) are kept in lockstep with them.
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
  /**
   * Freeform talking points / script for this beat, authored in a safe subset of
   * Markdown (headings, bold/italic, inline code, bullet/ordered lists, and
   * `- [ ]` task checkboxes). Stored as raw Markdown text; rendered to sanitized
   * HTML in read/presenter contexts (see `src/shared/markdown.ts`). Plain text is
   * a valid subset, so pre-Markdown notes round-trip unchanged.
   */
  notes: string
  snippets: Snippet[]
}

/**
 * Optional named variables for a deck. Forward-compatible with snippet
 * variable substitution (#7): snippet content may reference `{{key}}` tokens
 * that resolve against this map. Absent on current v1 decks; when present it is
 * a flat string→string map.
 */
export type DeckVariables = Record<string, string>

/** A full demo script. Persisted as a single `*.cuedeck.json` file. */
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
  /**
   * Optional named variables (forward-compat with #7). Omitted entirely on
   * decks that don't use variables so existing v1 files round-trip unchanged.
   */
  variables?: DeckVariables
}

/** Lightweight deck descriptor for the deck-picker list. */
export interface DeckSummary {
  id: string
  name: string
  filePath: string
  cardCount: number
  updatedAt: string
}

/**
 * Result of validating unknown input against the {@link Deck} model.
 * Either a successfully-typed deck or a list of human-readable errors.
 */
export type DeckValidationResult =
  | { ok: true; deck: Deck }
  | { ok: false; errors: string[] }

/** Result of a deck export attempt, surfaced to the renderer. */
export interface ExportResult {
  /** True when a file was written; false when the user cancelled. */
  ok: boolean
  /** Absolute path written to (present when ok). */
  filePath?: string
  /** Human-readable failure reason (present when a real error occurred). */
  error?: string
}

/** Result of a deck import attempt, surfaced to the renderer. */
export interface ImportResult {
  /** True when a deck was imported and saved; false when cancelled or invalid. */
  ok: boolean
  /** The freshly re-id'd deck summary (present when ok). */
  summary?: DeckSummary
  /** Human-readable failure reason (present when a real error occurred). */
  error?: string
}

/** The current deck schema version emitted by this build. */
export const CURRENT_SCHEMA_VERSION = 1

/** Every schema version this build knows how to read (and normalize forward). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1]

/** Canonical file extension / naming convention for on-disk decks. */
export const DECK_FILE_EXTENSION = '.cuedeck.json'
