import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { describe, it, expect } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import {
  CURRENT_SCHEMA_VERSION,
  DECK_FILE_EXTENSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type Deck
} from '../src/shared/types'
import {
  createEmptyDeck,
  generateId,
  isDeck,
  normalizeDeck,
  validateDeck
} from '../src/shared/deck'

/**
 * Format spec tests (#13): a known-good example validates against BOTH the
 * published JSON Schema and the hand-rolled validateDeck; several malformed
 * inputs fail; and an old v1 deck normalizes unchanged.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'))
}

const schema = readJson('schema/cuedeck.schema.json') as Record<string, unknown>
const exampleDeck = readJson('schema/examples/product-launch.cuedeck.json')

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateSchema = ajv.compile(schema)

describe('JSON Schema ↔ TS validator lockstep', () => {
  it('the published schema is a valid Draft 2020-12 schema', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.$id).toBeTypeOf('string')
    expect(schema.title).toBeTypeOf('string')
    expect(schema.description).toBeTypeOf('string')
  })

  it('the schema pins schemaVersion to the current version', () => {
    const props = schema.properties as Record<string, { const?: unknown; enum?: unknown[] }>
    expect(props.schemaVersion.const).toBe(CURRENT_SCHEMA_VERSION)
    expect(props.schemaVersion.enum).toEqual([...SUPPORTED_SCHEMA_VERSIONS])
  })

  it('the known-good example validates against the JSON Schema', () => {
    const ok = validateSchema(exampleDeck)
    if (!ok) {
      // Surface ajv errors if this ever regresses.
      throw new Error(JSON.stringify(validateSchema.errors, null, 2))
    }
    expect(ok).toBe(true)
  })

  it('the known-good example validates against validateDeck', () => {
    const result = validateDeck(exampleDeck)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deck.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(result.deck.cards).toHaveLength(3)
    }
  })

  it('the example uses the canonical file extension', () => {
    expect(DECK_FILE_EXTENSION).toBe('.cuedeck.json')
  })
})

describe('validateDeck — malformed inputs are rejected', () => {
  const base = exampleDeck as Deck

  const cases: Array<{ name: string; input: unknown }> = [
    { name: 'null', input: null },
    { name: 'a number', input: 42 },
    { name: 'an array', input: [] },
    { name: 'empty object', input: {} },
    { name: 'missing id', input: { ...base, id: undefined } },
    { name: 'empty-string id', input: { ...base, id: '' } },
    { name: 'non-string name', input: { ...base, name: 123 } },
    { name: 'cards not an array', input: { ...base, cards: 'nope' } },
    { name: 'bad createdAt', input: { ...base, createdAt: 'not-a-date' } },
    { name: 'unsupported schemaVersion', input: { ...base, schemaVersion: 999 } },
    { name: 'non-integer schemaVersion', input: { ...base, schemaVersion: 1.5 } },
    {
      name: 'card missing title',
      input: { ...base, cards: [{ id: 'c1', notes: '', snippets: [] }] }
    },
    {
      name: 'snippet with non-string content',
      input: {
        ...base,
        cards: [{ id: 'c1', title: 't', notes: '', snippets: [{ id: 's1', label: 'l', content: 5 }] }]
      }
    },
    { name: 'unknown top-level field', input: { ...base, bogus: true } },
    { name: 'variables with non-string value', input: { ...base, variables: { a: 1 } } }
  ]

  for (const { name, input } of cases) {
    it(`rejects ${name}`, () => {
      const result = validateDeck(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.every((e) => typeof e === 'string')).toBe(true)
      }
    })
  }

  it('an unknown top-level field also fails the JSON Schema', () => {
    // additionalProperties:false in the schema mirrors the TS validator.
    expect(validateSchema({ ...base, bogus: true })).toBe(false)
  })

  it('reports multiple errors at once', () => {
    const result = validateDeck({ id: '', name: 5, cards: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('normalizeDeck — old decks normalize unchanged', () => {
  it('leaves a valid current-version deck byte-identical', () => {
    const before = JSON.stringify(exampleDeck)
    const normalized = normalizeDeck(exampleDeck)
    // Deep-equal to the original object...
    expect(normalized).toEqual(exampleDeck)
    // ...and serializes identically (no added/removed keys, e.g. no `variables`).
    expect(JSON.stringify(normalized)).toBe(before)
    expect('variables' in normalized).toBe(false)
    // And the result is itself valid.
    expect(isDeck(normalized)).toBe(true)
  })

  it('a minimal v1 deck (no variables) round-trips unchanged', () => {
    const v1: Deck = {
      id: 'deck-1',
      name: 'Legacy Deck',
      cards: [{ id: 'card-1', title: 'One', notes: 'notes', snippets: [] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      schemaVersion: 1
    }
    const normalized = normalizeDeck(v1)
    expect(normalized).toEqual(v1)
    expect(JSON.stringify(normalized)).toBe(JSON.stringify(v1))
  })
})

describe('normalizeDeck — repairs loose input', () => {
  it('fills missing ids, defaults, and timestamps', () => {
    const normalized = normalizeDeck({
      name: 'Loose',
      cards: [{ title: 'Card', snippets: [{ label: 'L', content: 'C' }] }]
    })
    expect(normalized.id.length).toBeGreaterThan(0)
    expect(normalized.name).toBe('Loose')
    expect(normalized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(Number.isNaN(Date.parse(normalized.createdAt))).toBe(false)
    expect(Number.isNaN(Date.parse(normalized.updatedAt))).toBe(false)
    expect(normalized.cards[0].id.length).toBeGreaterThan(0)
    expect(normalized.cards[0].notes).toBe('')
    expect(normalized.cards[0].snippets[0].id.length).toBeGreaterThan(0)
    // The repaired deck is fully valid.
    expect(isDeck(normalized)).toBe(true)
  })

  it('defaults a nameless deck and empty input', () => {
    expect(normalizeDeck({}).name).toBe('Untitled Deck')
    expect(isDeck(normalizeDeck({}))).toBe(true)
    expect(normalizeDeck(null).cards).toHaveLength(0)
  })

  it('preserves and cleans a variables map', () => {
    const normalized = normalizeDeck({
      id: 'd',
      name: 'Vars',
      cards: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
      variables: { keep: 'yes', drop: 3 as unknown as string }
    })
    expect(normalized.variables).toEqual({ keep: 'yes' })
    expect(isDeck(normalized)).toBe(true)
    // The cleaned deck also passes the JSON Schema.
    expect(validateSchema(normalized)).toBe(true)
  })
})

describe('createEmptyDeck', () => {
  it('produces a valid, empty, current-version deck', () => {
    const deck = createEmptyDeck('My Demo')
    expect(deck.name).toBe('My Demo')
    expect(deck.cards).toHaveLength(0)
    expect(deck.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(deck.createdAt).toBe(deck.updatedAt)
    expect(isDeck(deck)).toBe(true)
    // A freshly-created deck validates against the published schema too.
    expect(validateSchema(deck)).toBe(true)
  })

  it('trims and defaults blank names', () => {
    expect(createEmptyDeck('   ').name).toBe('Untitled Deck')
    expect(createEmptyDeck('  Spaced  ').name).toBe('Spaced')
  })

  it('generates distinct ids', () => {
    expect(generateId()).not.toBe(generateId())
    expect(createEmptyDeck('a').id).not.toBe(createEmptyDeck('a').id)
  })
})
