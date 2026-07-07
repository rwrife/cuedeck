/**
 * Round-trip tests for the AI-authoring examples & fixtures (#16).
 *
 * These lock the "demo brief → deck" authoring contract. For every worked
 * example under `examples/<name>/`, we feed its `outline.json` through the *same*
 * code path the MCP `create_deck_from_outline` tool uses
 * ({@link DeckRepository.createDeckFromOutline}), against a throwaway `--dir`, and
 * assert the produced deck:
 *
 *  1. validates against the shared deck model, and
 *  2. equals the committed `deck.json` fixture once volatile fields (ids,
 *     timestamps) are normalized to deterministic sentinels.
 *
 * If someone changes the outline builder, the deck model, or an example outline
 * without regenerating the fixtures (`npm run gen:examples`), these tests fail —
 * exactly the regression guard the issue asks for.
 *
 * We also sanity-check the authoring hygiene the guide preaches: each example
 * ships a `brief.md`, the committed fixture is itself a valid deck, and every
 * `{{variable}}` referenced in a snippet is declared on the deck (so a demo never
 * ships with an unresolved placeholder).
 */

import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DeckStore } from '../src/cli/store'
import { DeckRepository } from '../src/cli/deckRepository'
import { extractVariableNames, validateDeck } from '../src/shared'
import {
  listExamples,
  loadExpectedDeck,
  loadOutline,
  normalizeForFixture
} from './support/exampleFixtures'

const examples = listExamples()

describe('AI-authoring examples (#16)', () => {
  let dir: string
  let repo: DeckRepository

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cuedeck-examples-'))
    repo = new DeckRepository(new DeckStore(dir))
  })

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('discovers the worked examples', () => {
    // The issue requires at least two (SaaS onboarding + API/dev-tool).
    expect(examples.length).toBeGreaterThanOrEqual(2)
    expect(examples.map((e) => e.name)).toContain('saas-onboarding')
    expect(examples.map((e) => e.name)).toContain('api-devtool')
  })

  for (const ex of examples) {
    describe(ex.name, () => {
      it('ships a brief and an expected deck fixture', () => {
        expect(existsSync(ex.briefPath), `${ex.name}/brief.md missing`).toBe(true)
        expect(existsSync(ex.deckPath), `${ex.name}/deck.json missing`).toBe(true)
      })

      it('outline builds a deck that matches the committed fixture (round-trip)', async () => {
        const outline = loadOutline(ex)
        const built = await repo.createDeckFromOutline(outline)

        // The freshly-built deck is a valid CueDeck deck…
        const validation = validateDeck(built)
        expect(validation.ok, JSON.stringify(validation, null, 2)).toBe(true)

        // …and, once ids/timestamps are normalized, equals the fixture exactly.
        const normalized = normalizeForFixture(built)
        const expected = loadExpectedDeck(ex)
        expect(normalized).toEqual(expected)
      })

      it('committed fixture is itself a valid deck', () => {
        const expected = loadExpectedDeck(ex)
        expect(validateDeck(expected).ok).toBe(true)
      })

      it('every {{variable}} used in a snippet is declared on the deck', () => {
        const deck = loadExpectedDeck(ex)
        const declared = new Set(Object.keys(deck.variables ?? {}))
        const missing = new Set<string>()
        for (const card of deck.cards) {
          for (const snippet of card.snippets) {
            for (const name of extractVariableNames(snippet.content)) {
              if (!declared.has(name)) missing.add(name)
            }
          }
        }
        expect([...missing], `undeclared variables in ${ex.name}`).toEqual([])
      })
    })
  }
})
