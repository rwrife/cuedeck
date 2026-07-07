/**
 * Headless deck store — the non-Electron counterpart to
 * `src/main/deckStore.ts`.
 *
 * It persists decks exactly the way the desktop app does — one JSON file per
 * deck at `<deckDir>/<id>.json` — but has no Electron, dialog, or IPC
 * dependency, so it runs in a plain Node process (the `cuedeck` CLI, and later
 * the MCP server). All reads/writes go through the shared
 * validator/normalizer/factory (`src/shared/deck.ts`), so the CLI and the app
 * can never drift on the file format.
 *
 * The target directory is resolved by {@link resolveDeckDir} (see
 * `./deckDir.ts`): the app's real `userData/decks` by default, or an explicit
 * `--dir` / `CUEDECK_DIR` override for headless/CI use.
 */

import { promises as fs } from 'fs'
import { basename, join, resolve as resolvePath } from 'path'
import {
  createEmptyDeck,
  generateId,
  normalizeDeck,
  validateDeck,
  type Deck,
  type DeckSummary,
  CURRENT_SCHEMA_VERSION
} from '../shared'

function nowIso(): string {
  return new Date().toISOString()
}

/** Serialize a deck the way the app does: pretty-printed JSON, 2-space indent. */
function serializeDeck(deck: Deck): string {
  return `${JSON.stringify(deck, null, 2)}\n`
}

/**
 * A file-backed deck store rooted at a single directory. Construct one with the
 * resolved deck directory (see {@link resolveDeckDir}) and call its methods to
 * manage decks headlessly.
 */
export class DeckStore {
  constructor(private readonly dir: string) {}

  /** Absolute path to this store's deck directory. */
  get directory(): string {
    return this.dir
  }

  /** On-disk path for a deck id. */
  private pathFor(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  /** Ensure the deck directory exists (created recursively, like the app). */
  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  /**
   * Read + parse a deck file by absolute path. Returns `null` when the file
   * can't be read or isn't JSON. Valid decks are returned unchanged; a file that
   * parses but is structurally loose is repaired via `normalizeDeck` so it still
   * loads — identical to the app's `readDeckFile`.
   */
  private async readFileDeck(path: string): Promise<Deck | null> {
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
    return result.ok ? result.deck : normalizeDeck(parsed)
  }

  /** List all decks in the directory as lightweight summaries (newest first). */
  async list(): Promise<DeckSummary[]> {
    await this.ensureDir()
    let files: string[]
    try {
      files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    const summaries: DeckSummary[] = []
    for (const file of files) {
      const path = join(this.dir, file)
      const deck = await this.readFileDeck(path)
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
  }

  /** Load a single deck by id, or `null` if it doesn't exist / can't be read. */
  async load(id: string): Promise<Deck | null> {
    await this.ensureDir()
    return this.readFileDeck(this.pathFor(id))
  }

  /**
   * Persist a deck, stamping `updatedAt`. The deck is normalized first so the
   * on-disk file is always a well-formed current-version deck.
   */
  async save(deck: Deck): Promise<Deck> {
    await this.ensureDir()
    const normalized = normalizeDeck(deck)
    const toSave: Deck = { ...normalized, updatedAt: nowIso() }
    await fs.writeFile(this.pathFor(toSave.id), serializeDeck(toSave), 'utf-8')
    return toSave
  }

  /** Create and persist a new, empty deck with the given name. */
  async create(name: string): Promise<Deck> {
    await this.ensureDir()
    const deck = createEmptyDeck(name)
    await fs.writeFile(this.pathFor(deck.id), serializeDeck(deck), 'utf-8')
    return deck
  }

  /** Delete a deck by id. Returns `true` if a file was removed. */
  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.pathFor(id))
      return true
    } catch {
      return false
    }
  }

  /**
   * Import a deck from an arbitrary JSON file: validate, normalize, re-id, and
   * persist — mirroring the app's Import, but reading a caller-supplied path
   * instead of a native open dialog. Throws {@link DeckIoError} on read / JSON /
   * validation failure so the CLI can print a clear message and exit nonzero.
   *
   * @returns the freshly-persisted (re-id'd) deck.
   */
  async importFile(file: string): Promise<Deck> {
    await this.ensureDir()
    const sourcePath = resolvePath(file)
    let raw: string
    try {
      raw = await fs.readFile(sourcePath, 'utf-8')
    } catch (err) {
      throw new DeckIoError(`Could not read file "${file}": ${(err as Error).message}`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new DeckIoError(`"${basename(sourcePath)}" is not valid JSON.`)
    }
    const validation = validateDeck(parsed)
    if (!validation.ok) {
      throw new DeckIoError(
        `"${basename(sourcePath)}" is not a valid CueDeck file:\n` +
          validation.errors.map((e) => `  - ${e}`).join('\n')
      )
    }
    const now = nowIso()
    const normalized = normalizeDeck(validation.deck)
    const imported: Deck = {
      ...normalized,
      id: generateId(),
      createdAt: normalized.createdAt || now,
      updatedAt: now,
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
    await fs.writeFile(this.pathFor(imported.id), serializeDeck(imported), 'utf-8')
    return imported
  }

  /**
   * Export a deck to a file (or return its JSON text). When `outFile` is given
   * the deck JSON is written there; otherwise the serialized JSON string is
   * returned for the caller to print to stdout.
   *
   * @returns the serialized deck JSON (also written to `outFile` when provided).
   */
  async exportDeck(id: string, outFile?: string): Promise<string> {
    const deck = await this.load(id)
    if (!deck) throw new DeckIoError(`Deck "${id}" not found.`)
    const json = serializeDeck(deck)
    if (outFile) {
      await fs.writeFile(resolvePath(outFile), json, 'utf-8')
    }
    return json
  }
}

/**
 * Error type for deck I/O / validation failures in the headless store. The CLI
 * catches these to print a friendly message and set a nonzero exit code.
 */
export class DeckIoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeckIoError'
  }
}
