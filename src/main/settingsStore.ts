import { app, ipcMain, nativeTheme } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeSettings,
  type Settings
} from '../shared/settings'

/**
 * Settings persistence layer (#8). Preferences are stored as a single JSON file
 * at <userData>/settings.json — human-readable, trivially portable, and
 * separate from decks so wiping decks never loses UI preferences (and vice
 * versa).
 *
 * Reads go through the shared normalizer (src/shared/settings.ts) so a missing,
 * partial, or hand-edited file always loads into a complete, valid object; the
 * main process and renderer share one definition of the settings shape and
 * can't drift.
 *
 * The in-memory `cache` is the source of truth once loaded, so synchronous
 * callers in the main process (e.g. deciding the Presenter Mode always-on-top
 * default) can read the current settings without awaiting a disk read.
 */

let cache: Settings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * Load settings from disk into the cache (once). A malformed or missing file
 * falls back to defaults rather than throwing, so the app always starts.
 */
async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  let parsed: unknown = undefined
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    parsed = JSON.parse(raw)
  } catch {
    // No file yet, unreadable, or invalid JSON → defaults.
    parsed = undefined
  }
  cache = normalizeSettings(parsed)
  return cache
}

/** Persist the given settings to disk (pretty-printed for hand-editing). */
async function writeSettings(settings: Settings): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Synchronous read of the current settings for other main-process code. Returns
 * the cache when loaded, otherwise the defaults; call {@link initSettings}
 * during app startup so the cache is warm before it's needed.
 */
export function getSettingsSync(): Settings {
  return cache ?? DEFAULT_SETTINGS
}

/**
 * Warm the settings cache during app startup. Safe to call before any window
 * exists. Returns the loaded settings so the caller can, e.g., pick an initial
 * window background color that matches the saved theme.
 */
export async function initSettings(): Promise<Settings> {
  return loadSettings()
}

export function registerSettingsHandlers(): void {
  // Return the full, normalized settings object.
  ipcMain.handle(IPC.settingsGet, async (): Promise<Settings> => {
    return loadSettings()
  })

  // Merge an incoming (possibly partial) patch onto the current settings,
  // validating each field, persist, and return the resulting full object so the
  // renderer can update its store from the authoritative result.
  ipcMain.handle(IPC.settingsSet, async (_evt, patch: Partial<Settings>): Promise<Settings> => {
    const current = await loadSettings()
    const next = mergeSettings(current, patch ?? {})
    cache = next
    await writeSettings(next)
    return next
  })
}

/** Keep a handle so callers can subscribe/unsubscribe symmetrically if needed. */
export { nativeTheme }
