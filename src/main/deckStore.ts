import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { IPC } from '../shared/ipc'
import {
  CURRENT_SCHEMA_VERSION,
  type Deck,
  type DeckSummary,
  type DeleteResult,
  type DuplicateResult,
  type ExportResult,
  type ImportResult,
  type RenameResult
} from '../shared/types'
import { createEmptyDeck, generateId, normalizeDeck, validateDeck } from '../shared/deck'
import { deleteDeckInDir, duplicateDeckInDir, renameDeckInDir } from './deckLibraryOps'

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

/** Turn a deck name into a safe default export filename: "<name>.cuedeck.json". */
function defaultExportName(name: string): string {
  const safe = (name || 'deck')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safe || 'deck'}.cuedeck.json`
}

/** Resolve the BrowserWindow that owns a given IPC event, for dialog parenting. */
function windowFor(evt: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(evt.sender)
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

  ipcMain.handle(IPC.deckDelete, async (_evt, id: string): Promise<DeleteResult> => {
    await ensureDir()
    return deleteDeckInDir(decksDir(), id)
  })

  // Rename a deck in place (#34): validates the new name and rewrites the
  // file with an updated `name` + `updatedAt`.
  ipcMain.handle(IPC.deckRename, async (_evt, id: string, name: string): Promise<RenameResult> => {
    await ensureDir()
    return renameDeckInDir(decksDir(), id, name)
  })

  // Duplicate a deck (#34): copies its full contents into a freshly-id'd file
  // with a non-colliding "<name> copy" name.
  ipcMain.handle(IPC.deckDuplicate, async (_evt, id: string): Promise<DuplicateResult> => {
    await ensureDir()
    return duplicateDeckInDir(decksDir(), id)
  })

  // Export a deck to an arbitrary .json file via a native save dialog.
  ipcMain.handle(IPC.deckExport, async (evt, id: string): Promise<ExportResult> => {
    await ensureDir()
    const deck = await readDeckFile(deckPath(id))
    if (!deck) return { ok: false, error: 'Deck not found.' }

    const parent = windowFor(evt)
    const options = {
      title: 'Export Deck',
      defaultPath: defaultExportName(deck.name),
      filters: [
        { name: 'CueDeck / JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false }

    try {
      await fs.writeFile(result.filePath, JSON.stringify(deck, null, 2), 'utf-8')
      return { ok: true, filePath: result.filePath }
    } catch (err) {
      return { ok: false, error: `Could not write file: ${(err as Error).message}` }
    }
  })

  // Import a deck from a .json file: validate, re-id, persist, and return its summary.
  ipcMain.handle(IPC.deckImport, async (evt): Promise<ImportResult> => {
    await ensureDir()

    const parent = windowFor(evt)
    const options = {
      title: 'Import Deck',
      properties: ['openFile' as const],
      filters: [
        { name: 'CueDeck / JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { ok: false }

    const sourcePath = result.filePaths[0]
    let raw: string
    try {
      raw = await fs.readFile(sourcePath, 'utf-8')
    } catch (err) {
      return { ok: false, error: `Could not read file: ${(err as Error).message}` }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        ok: false,
        error: `"${basename(sourcePath)}" is not valid JSON.`
      }
    }

    const validation = validateDeck(parsed)
    if (!validation.ok) {
      return {
        ok: false,
        error: `"${basename(sourcePath)}" is not a valid CueDeck file.`
      }
    }

    // Normalize (fills defaults / upgrades schemaVersion), then re-id and
    // re-stamp so importing never collides with an existing deck.
    const now = nowIso()
    const normalized = normalizeDeck(validation.deck)
    const imported: Deck = {
      ...normalized,
      id: generateId(),
      createdAt: normalized.createdAt || now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION
    }

    try {
      await fs.writeFile(deckPath(imported.id), JSON.stringify(imported, null, 2), 'utf-8')
    } catch (err) {
      return { ok: false, error: `Could not save imported deck: ${(err as Error).message}` }
    }

    return {
      ok: true,
      summary: {
        id: imported.id,
        name: imported.name,
        filePath: deckPath(imported.id),
        cardCount: imported.cards.length,
        updatedAt: imported.updatedAt
      }
    }
  })
}
