import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CURRENT_SCHEMA_VERSION, type Deck } from '../src/shared/types'
import { deleteDeckInDir, duplicateDeckInDir, renameDeckInDir } from '../src/main/deckLibraryOps'

/**
 * Coverage for the Library surface's filesystem-level deck lifecycle
 * operations (#34): rename, duplicate, and delete. Runs against a real temp
 * directory (like `test/cli.test.ts`'s `--dir` fixtures) rather than mocking
 * `fs`/Electron, so it exercises the exact on-disk behavior the app relies on.
 */

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'Product Launch',
    cards: [{ id: 'c1', title: 'Intro', notes: '', snippets: [] }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    variables: {},
    ...overrides
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cuedeck-library-ops-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function writeDeckFile(deck: Deck): Promise<void> {
  await fs.writeFile(join(dir, `${deck.id}.json`), JSON.stringify(deck, null, 2), 'utf-8')
}

describe('renameDeckInDir', () => {
  it('renames a deck and stamps a new updatedAt', async () => {
    await writeDeckFile(makeDeck())

    const result = await renameDeckInDir(dir, 'deck-1', 'New Name')

    expect(result.ok).toBe(true)
    expect(result.summary?.name).toBe('New Name')
    const onDisk = JSON.parse(await fs.readFile(join(dir, 'deck-1.json'), 'utf-8')) as Deck
    expect(onDisk.name).toBe('New Name')
    expect(onDisk.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
    // Everything else is untouched (cards, id, schema).
    expect(onDisk.id).toBe('deck-1')
    expect(onDisk.cards).toEqual(makeDeck().cards)
  })

  it('trims whitespace from the new name', async () => {
    await writeDeckFile(makeDeck())
    const result = await renameDeckInDir(dir, 'deck-1', '  Trimmed  ')
    expect(result.summary?.name).toBe('Trimmed')
  })

  it('rejects a blank name with a typed error and does not touch the file', async () => {
    await writeDeckFile(makeDeck())
    const result = await renameDeckInDir(dir, 'deck-1', '   ')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    const onDisk = JSON.parse(await fs.readFile(join(dir, 'deck-1.json'), 'utf-8')) as Deck
    expect(onDisk.name).toBe('Product Launch')
  })

  it('reports a typed error for an unknown deck id', async () => {
    const result = await renameDeckInDir(dir, 'does-not-exist', 'New Name')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('duplicateDeckInDir', () => {
  it('creates a new file with a fresh id and a "<name> copy" name', async () => {
    await writeDeckFile(makeDeck())

    const result = await duplicateDeckInDir(dir, 'deck-1')

    expect(result.ok).toBe(true)
    expect(result.summary?.name).toBe('Product Launch copy')
    expect(result.summary?.id).not.toBe('deck-1')

    // Original is untouched.
    const original = JSON.parse(await fs.readFile(join(dir, 'deck-1.json'), 'utf-8')) as Deck
    expect(original.name).toBe('Product Launch')

    // Copy carries the same cards.
    const copy = JSON.parse(
      await fs.readFile(join(dir, `${result.summary!.id}.json`), 'utf-8')
    ) as Deck
    expect(copy.cards).toEqual(original.cards)
    expect(copy.name).toBe('Product Launch copy')
  })

  it('avoids name collisions across repeated duplication', async () => {
    await writeDeckFile(makeDeck())
    const first = await duplicateDeckInDir(dir, 'deck-1')
    expect(first.summary?.name).toBe('Product Launch copy')

    const second = await duplicateDeckInDir(dir, 'deck-1')
    expect(second.summary?.name).toBe('Product Launch copy 2')
  })

  it('reports a typed error for an unknown deck id', async () => {
    const result = await duplicateDeckInDir(dir, 'does-not-exist')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('deleteDeckInDir', () => {
  it('deletes an existing deck file', async () => {
    await writeDeckFile(makeDeck())
    const result = await deleteDeckInDir(dir, 'deck-1')
    expect(result.ok).toBe(true)
    await expect(fs.readFile(join(dir, 'deck-1.json'))).rejects.toThrow()
  })

  it('treats deleting an already-missing deck as a no-op success', async () => {
    const result = await deleteDeckInDir(dir, 'never-existed')
    expect(result.ok).toBe(true)
  })
})
