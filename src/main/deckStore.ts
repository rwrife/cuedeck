import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { type Deck, type DeckSummary } from '../shared/types'
import { createEmptyDeck, normalizeDeck, validateDeck } from '../shared/deck'

/**
 * Deck persistence layer. Decks are stored as individual JSON files under
 * <userData>/decks/<id>.json. This keeps things simple, human-readable, and
 * trivially portable (export = copy the file).
 *
 * All reads go through the shared validator/normalizer (src/shared/deck.ts) so
 * the main process, renderer, CLI, and MCP server share one definition of the
 * deck format and can't drift.
 */

function decksDir(): string {
  return join(app.getPath('userData'), 'decks')
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(decksDir(), { recursive: true })
}

function deckPath(id: string): string {
  return join(decksDir(), `${id}.json`)
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Read + parse a deck file. Returns `null` only when the file can't be read or
 * isn't JSON. Valid decks are returned unchanged; a file that parses but is
 * structurally loose is repaired via `normalizeDeck` so it still loads.
 */
async function readDeckFile(path: string): Promise<Deck | null> {
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const result = validateDeck(parsed)
  // Already valid → return as-is (existing v1 decks load byte-for-byte).
  // Parses but invalid → normalize so a slightly-off deck still opens.
  return result.ok ? result.deck : normalizeDeck(parsed)
}

export function registerDeckHandlers(): void {
  ipcMain.handle(IPC.deckList, async (): Promise<DeckSummary[]> => {
    await ensureDir()
    const files = (await fs.readdir(decksDir())).filter((f) => f.endsWith('.json'))
    const summaries: DeckSummary[] = []
    for (const file of files) {
      const path = join(decksDir(), file)
      const deck = await readDeckFile(path)
      if (!deck) continue
      summaries.push({
        id: deck.id,
        name: deck.name,
        filePath: path,
        cardCount: deck.cards?.length ?? 0,
        updatedAt: deck.updatedAt
      })
    }
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return summaries
  })

  ipcMain.handle(IPC.deckLoad, async (_evt, id: string): Promise<Deck | null> => {
    await ensureDir()
    return readDeckFile(deckPath(id))
  })

  ipcMain.handle(IPC.deckSave, async (_evt, deck: Deck): Promise<Deck> => {
    await ensureDir()
    const toSave: Deck = { ...deck, updatedAt: nowIso() }
    await fs.writeFile(deckPath(deck.id), JSON.stringify(toSave, null, 2), 'utf-8')
    return toSave
  })

  ipcMain.handle(IPC.deckCreate, async (_evt, name: string): Promise<Deck> => {
    await ensureDir()
    const deck = createEmptyDeck(name)
    await fs.writeFile(deckPath(deck.id), JSON.stringify(deck, null, 2), 'utf-8')
    return deck
  })

  ipcMain.handle(IPC.deckDelete, async (_evt, id: string): Promise<boolean> => {
    try {
      await fs.unlink(deckPath(id))
      return true
    } catch {
      return false
    }
  })
}
