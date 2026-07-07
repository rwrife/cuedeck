import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Deck } from '../src/shared/types'

/**
 * Smoke tests for the shared domain model. These are intentionally lightweight —
 * richer logic tests arrive with the features that add that logic.
 */
describe('shared domain model', () => {
  it('exposes a positive schema version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0)
  })

  it('can construct a well-formed empty deck', () => {
    const deck: Deck = {
      id: 'test-id',
      name: 'Test Deck',
      cards: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
    expect(deck.cards).toHaveLength(0)
    expect(deck.name).toBe('Test Deck')
    expect(deck.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})
