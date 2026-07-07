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
 * Named variables for a deck (snippet variable substitution, #7). Snippet
 * content may reference `{{key}}` tokens that resolve against this map at copy /
 * drag time. A flat string→string map; empty (`{}`) when the deck defines no
 * variables. Introduced in schema v2; v1 decks are migrated forward with an
 * empty map (see `normalizeDeck`).
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
   * Named variables for `{{placeholder}}` substitution in snippet content (#7).
   * Present on all schema-v2 decks (an empty `{}` when unused). Optional on the
   * type only so that hand-written v1 fixtures and in-flight loose input remain
   * assignable; `normalizeDeck` always fills it for persisted decks.
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

/**
 * The current deck schema version emitted by this build.
 *
 * - v1: original deck model (no variables).
 * - v2: adds deck-level `variables` for snippet `{{placeholder}}` substitution
 *   (#7). Older v1 decks are migrated forward on load (variables default to
 *   `{}`); see `normalizeDeck`.
 */
export const CURRENT_SCHEMA_VERSION = 2

/** Every schema version this build knows how to read (and normalize forward). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2]

/** Canonical file extension / naming convention for on-disk decks. */
export const DECK_FILE_EXTENSION = '.cuedeck.json'
