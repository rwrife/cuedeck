/**
 * Filesystem-level deck lifecycle operations for the Library surface (#34):
 * rename, duplicate, and delete a deck file, plus a small shared summary
 * builder. Extracted out of `src/main/deckStore.ts` — which wires these to
 * Electron IPC/dialogs — so the actual file logic is a plain, directory-
 * parameterized module with no Electron dependency and can be unit-tested
 * directly against a real temp directory (see `test/deckLibraryOps.test.ts`),
 * mirroring the existing `src/cli/store.ts` / `src/main/deckStore.ts` split.
 *
 * All reads/writes go through the shared validator/normalizer
 * (`src/shared/deck.ts`) and the shared `library.ts` helpers, so behavior
 * matches the rest of the app (main, CLI, MCP) exactly.
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import type { Deck, DeckSummary, DeleteResult, DuplicateResult, RenameResult } from '../shared/types'
import { generateId, normalizeDeck, validateDeck } from '../shared/deck'
import { suggestCopyName, validateDeckName } from '../shared/library'

function nowIso(): string {
  return new Date().toISOString()
}

function deckPathIn(dir: string, id: string): string {
  return join(dir, `${id}.json`)
}

async function writeDeck(path: string, deck: Deck): Promise<void> {
  await fs.writeFile(path, JSON.stringify(deck, null, 2), 'utf-8')
}

/**
 * Read + parse a deck file. Returns `null` only when the file can't be read or
 * isn't JSON (mirrors `main/deckStore.ts`'s `readDeckFile`; kept as a small
 * duplicate rather than a shared import to avoid a circular module edge).
 */
async function readDeckFileAt(path: string): Promise<Deck | null> {
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

function summaryOf(deck: Deck, path: string): DeckSummary {
  return {
    id: deck.id,
    name: deck.name,
    filePath: path,
    cardCount: deck.cards?.length ?? 0,
    updatedAt: deck.updatedAt
  }
}

/** List every deck's name in `dir` (used to keep duplicate names unique). */
async function listDeckNames(dir: string): Promise<string[]> {
  let files: string[]
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const names: string[] = []
  for (const file of files) {
    const deck = await readDeckFileAt(join(dir, file))
    if (deck) names.push(deck.name)
  }
  return names
}

/**
 * Rename a deck in place: validates the new name (non-blank), then rewrites
 * the deck file with the updated `name` + `updatedAt`. Returns a typed
 * failure — never throws — for "deck not found," an invalid name, or a
 * write failure, so the renderer always gets an explicit, renderable error
 * instead of a silent no-op.
 */
export async function renameDeckInDir(dir: string, id: string, name: string): Promise<RenameResult> {
  const validated = validateDeckName(name)
  if (!validated.ok) return { ok: false, error: validated.error }

  const path = deckPathIn(dir, id)
  const deck = await readDeckFileAt(path)
  if (!deck) return { ok: false, error: 'Deck not found.' }

  const updated: Deck = { ...deck, name: validated.name, updatedAt: nowIso() }
  try {
    await writeDeck(path, updated)
  } catch (err) {
    return { ok: false, error: `Could not rename deck: ${(err as Error).message}` }
  }
  return { ok: true, summary: summaryOf(updated, path) }
}

/**
 * Duplicate a deck: copies its full contents (cards, snippets, variables)
 * into a freshly-id'd file with a non-colliding "<name> copy" name (see
 * `suggestCopyName`) and fresh `createdAt`/`updatedAt` timestamps. The
 * original deck is left untouched.
 */
export async function duplicateDeckInDir(dir: string, id: string): Promise<DuplicateResult> {
  const sourcePath = deckPathIn(dir, id)
  const deck = await readDeckFileAt(sourcePath)
  if (!deck) return { ok: false, error: 'Deck not found.' }

  const existingNames = await listDeckNames(dir)
  const now = nowIso()
  const copy: Deck = {
    ...deck,
    id: generateId(),
    name: suggestCopyName(deck.name, existingNames),
    createdAt: now,
    updatedAt: now
  }
  const path = deckPathIn(dir, copy.id)
  try {
    await writeDeck(path, copy)
  } catch (err) {
    return { ok: false, error: `Could not duplicate deck: ${(err as Error).message}` }
  }
  return { ok: true, summary: summaryOf(copy, path) }
}

/**
 * Delete a deck file. A file that's already gone counts as success (deletion
 * is idempotent — the deck is absent either way); any other failure (e.g. a
 * locked file) is surfaced as a typed error rather than a bare `false`.
 */
export async function deleteDeckInDir(dir: string, id: string): Promise<DeleteResult> {
  try {
    await fs.unlink(deckPathIn(dir, id))
    return { ok: true }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: true }
    return { ok: false, error: `Could not delete deck: ${(err as Error).message}` }
  }
}
