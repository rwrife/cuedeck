import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { IPC } from '../shared/ipc'
import { CURRENT_SCHEMA_VERSION, type Deck, type DeckSummary } from '../shared/types'

/**
 * Deck persistence layer. Decks are stored as individual JSON files under
 * <userData>/decks/<id>.json. This keeps things simple, human-readable, and
 * trivially portable (export = copy the file).
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

async function readDeckFile(path: string): Promise<Deck | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw) as Deck
  } catch {
    return null
  }
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
    const id = randomUUID()
    const deck: Deck = {
      id,
      name: name?.trim() || 'Untitled Deck',
      cards: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
    await fs.writeFile(deckPath(id), JSON.stringify(deck, null, 2), 'utf-8')
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
