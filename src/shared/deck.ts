/**
 * Shared deck validation + normalization — the single source of truth for the
 * CueDeck file format, used by the app (main + renderer), the CLI, and the MCP
 * server so they can never drift.
 *
 * Design goals:
 *  - Dependency-light: hand-rolled TypeScript guards, no runtime dependency, so
 *    this module is safe to bundle into the renderer (browser) as well as Node.
 *  - Authoritative TS types (see ./types.ts) kept in lockstep with the published
 *    JSON Schema (schema/cuedeck.schema.json).
 *  - `validateDeck` is strict and reports every problem it finds.
 *  - `normalizeDeck` is lenient: it fills defaults, assigns missing ids, sets
 *    timestamps, and upgrades `schemaVersion`, while leaving a well-formed
 *    current-version deck byte-identical (existing v1 decks round-trip).
 */

import {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type CueCard,
  type Deck,
  type DeckValidationResult,
  type DeckVariables,
  type Snippet
} from './types'

/* -------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Generate a v4-ish UUID. Uses the platform `crypto.randomUUID` when available
 * (Node ≥ 16.7, all modern browsers) and falls back to a Math.random-based
 * implementation only if that API is missing. Kept internal so callers never
 * depend on a specific crypto surface.
 */
export function generateId(): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  // Fallback: RFC-4122-shaped id. Not cryptographically strong, but ids only
  // need to be unique within a deck, and this path is essentially never taken.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Report any keys on `input` that aren't in the allowed set. Mirrors the JSON
 * Schema's `additionalProperties: false` so the two validators stay in lockstep.
 */
function checkUnknownKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}: unknown field "${key}"`)
    }
  }
}

const SNIPPET_KEYS = ['id', 'label', 'content'] as const
const CARD_KEYS = ['id', 'title', 'notes', 'snippets'] as const
const DECK_KEYS = [
  'id',
  'name',
  'cards',
  'createdAt',
  'updatedAt',
  'schemaVersion',
  'variables'
] as const

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validateSnippet(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path}: expected an object`)
    return
  }
  if (!isNonEmptyString(input.id)) errors.push(`${path}.id: expected a non-empty string`)
  if (typeof input.label !== 'string') errors.push(`${path}.label: expected a string`)
  if (typeof input.content !== 'string') errors.push(`${path}.content: expected a string`)
  checkUnknownKeys(input, SNIPPET_KEYS, path, errors)
}

function validateCard(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path}: expected an object`)
    return
  }
  if (!isNonEmptyString(input.id)) errors.push(`${path}.id: expected a non-empty string`)
  if (typeof input.title !== 'string') errors.push(`${path}.title: expected a string`)
  if (typeof input.notes !== 'string') errors.push(`${path}.notes: expected a string`)
  if (!Array.isArray(input.snippets)) {
    errors.push(`${path}.snippets: expected an array`)
  } else {
    input.snippets.forEach((s, i) => validateSnippet(s, `${path}.snippets[${i}]`, errors))
  }
  checkUnknownKeys(input, CARD_KEYS, path, errors)
}

function validateVariables(input: unknown, path: string, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push(`${path}: expected an object mapping string keys to string values`)
    return
  }
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string') {
      errors.push(`${path}.${key}: expected a string value`)
    }
  }
}

/**
 * Validate arbitrary input against the {@link Deck} model.
 *
 * Strict: reports every structural problem it finds. On success the returned
 * `deck` is the same object reference, now typed as `Deck` (no mutation). Use
 * {@link normalizeDeck} first if you want defaults/ids/timestamps filled in.
 */
export function validateDeck(input: unknown): DeckValidationResult {
  const errors: string[] = []

  if (!isRecord(input)) {
    return { ok: false, errors: ['deck: expected a JSON object'] }
  }

  if (!isNonEmptyString(input.id)) errors.push('deck.id: expected a non-empty string')
  if (typeof input.name !== 'string') errors.push('deck.name: expected a string')

  if (typeof input.createdAt !== 'string' || Number.isNaN(Date.parse(input.createdAt))) {
    errors.push('deck.createdAt: expected an ISO date-time string')
  }
  if (typeof input.updatedAt !== 'string' || Number.isNaN(Date.parse(input.updatedAt))) {
    errors.push('deck.updatedAt: expected an ISO date-time string')
  }

  if (typeof input.schemaVersion !== 'number' || !Number.isInteger(input.schemaVersion)) {
    errors.push('deck.schemaVersion: expected an integer')
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(input.schemaVersion)) {
    errors.push(
      `deck.schemaVersion: unsupported version ${input.schemaVersion} ` +
        `(supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')})`
    )
  }

  if (!Array.isArray(input.cards)) {
    errors.push('deck.cards: expected an array')
  } else {
    input.cards.forEach((c, i) => validateCard(c, `deck.cards[${i}]`, errors))
  }

  if (input.variables !== undefined) {
    validateVariables(input.variables, 'deck.variables', errors)
  }

  checkUnknownKeys(input, DECK_KEYS, 'deck', errors)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, deck: input as unknown as Deck }
}

/** Convenience boolean guard around {@link validateDeck}. */
export function isDeck(input: unknown): input is Deck {
  return validateDeck(input).ok
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function normalizeSnippet(input: unknown): Snippet {
  const rec = isRecord(input) ? input : {}
  return {
    id: isNonEmptyString(rec.id) ? rec.id : generateId(),
    label: typeof rec.label === 'string' ? rec.label : '',
    content: typeof rec.content === 'string' ? rec.content : ''
  }
}

function normalizeCard(input: unknown): CueCard {
  const rec = isRecord(input) ? input : {}
  return {
    id: isNonEmptyString(rec.id) ? rec.id : generateId(),
    title: typeof rec.title === 'string' ? rec.title : '',
    notes: typeof rec.notes === 'string' ? rec.notes : '',
    snippets: Array.isArray(rec.snippets) ? rec.snippets.map(normalizeSnippet) : []
  }
}

function normalizeVariables(input: unknown): DeckVariables | undefined {
  if (!isRecord(input)) return undefined
  const out: DeckVariables = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/**
 * Coerce arbitrary input into a well-formed {@link Deck}: fills defaults,
 * assigns missing ids, ensures timestamps, upgrades `schemaVersion` to the
 * current version, and migrates the deck forward.
 *
 * Migration contract (#7): every normalized deck is at
 * {@link CURRENT_SCHEMA_VERSION} and always carries a `variables` map. Older v1
 * decks (which had no `variables` field) gain an empty `{}`; existing values are
 * preserved and cleaned (non-string entries dropped). A deck that is already a
 * well-formed current-version deck (v2, with a `variables` map) is returned
 * deep-equal to its input, so re-normalizing is idempotent.
 */
export function normalizeDeck(input: unknown): Deck {
  const rec = isRecord(input) ? input : {}
  const timestamp = nowIso()

  const createdAt =
    typeof rec.createdAt === 'string' && !Number.isNaN(Date.parse(rec.createdAt))
      ? rec.createdAt
      : timestamp
  const updatedAt =
    typeof rec.updatedAt === 'string' && !Number.isNaN(Date.parse(rec.updatedAt))
      ? rec.updatedAt
      : timestamp

  const deck: Deck = {
    id: isNonEmptyString(rec.id) ? rec.id : generateId(),
    name: typeof rec.name === 'string' ? rec.name : 'Untitled Deck',
    cards: Array.isArray(rec.cards) ? rec.cards.map(normalizeCard) : [],
    createdAt,
    updatedAt,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    // v2 decks always carry a variables map. Preserve + clean any existing map;
    // otherwise default to `{}` (this is the v1→v2 migration path).
    variables: normalizeVariables(rec.variables) ?? {}
  }

  return deck
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create a fresh, empty deck with the given name. Shared by the app and all
 * tooling (CLI / MCP) so new decks are created identically everywhere. New decks
 * are schema v2 and start with an empty `variables` map.
 */
export function createEmptyDeck(name: string): Deck {
  const timestamp = nowIso()
  return {
    id: generateId(),
    name: name?.trim() || 'Untitled Deck',
    cards: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables: {}
  }
}
