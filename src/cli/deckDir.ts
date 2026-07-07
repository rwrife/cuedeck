/**
 * Headless resolution of CueDeck's on-disk deck directory — WITHOUT booting
 * Electron.
 *
 * The desktop app stores decks as `<userData>/decks/<id>.json`, where
 * `<userData>` is Electron's per-user data directory
 * (`app.getPath('userData')`). The CLI (#14) and, later, the MCP server (#15)
 * must read/write that exact same location so a deck authored in a shell shows
 * up in the GUI and vice-versa. Booting Electron just to learn that path would
 * defeat the purpose of a *headless* tool, so we replicate Electron's own
 * resolution here.
 *
 * ## How Electron derives `userData`
 *
 * `app.getPath('userData')` = `app.getPath('appData')` joined with the app name.
 * The app name is Electron's `app.getName()`, which for a packaged/dev app comes
 * from the nearest `package.json` `name` field — here, `"cuedeck"`. The base
 * `appData` directory is platform-specific:
 *
 *  - **Windows:** `%APPDATA%`  → `C:\Users\<you>\AppData\Roaming`
 *  - **macOS:**   `~/Library/Application Support`
 *  - **Linux:**   `$XDG_CONFIG_HOME`, else `~/.config`
 *
 * Joined with the app name (`cuedeck`) this yields exactly the paths documented
 * in the README's "Data Storage" section:
 *
 *  - Windows: `%APPDATA%/cuedeck/decks/`
 *  - macOS:   `~/Library/Application Support/cuedeck/decks/`
 *  - Linux:   `~/.config/cuedeck/decks/`
 *
 * ## Overrides (headless / CI)
 *
 * For scripting, tests, and CI where there is no real user profile — or where
 * you simply want an isolated deck store — the directory can be overridden. In
 * priority order:
 *
 *  1. An explicit `dir` argument (from the CLI's `--dir <path>` flag).
 *  2. The `CUEDECK_DIR` environment variable.
 *  3. The replicated Electron `userData/decks` path (the default).
 *
 * When an override is used it is treated as the **decks directory itself**
 * (i.e. deck files live directly inside it), matching how a user would point the
 * CLI at a throwaway folder.
 */

import { homedir } from 'os'
import { join } from 'path'

/** The Electron app name; must match `package.json` `name` so paths line up. */
export const APP_NAME = 'cuedeck'

/** The subdirectory (under `userData`) that holds individual deck files. */
export const DECKS_SUBDIR = 'decks'

/** The environment variable that overrides the deck directory for headless use. */
export const DECK_DIR_ENV = 'CUEDECK_DIR'

/**
 * A minimal, injectable view of the process environment + platform, so the
 * resolver can be unit-tested deterministically across OSes without mutating the
 * real `process`.
 */
export interface DeckDirEnv {
  /** `process.platform` — `'win32' | 'darwin' | 'linux' | …`. */
  platform: NodeJS.Platform
  /** Relevant environment variables (all optional). */
  env: {
    CUEDECK_DIR?: string
    APPDATA?: string
    XDG_CONFIG_HOME?: string
    HOME?: string
  }
  /** The user's home directory (defaults to `os.homedir()`). */
  home: string
}

/** Capture the live environment for {@link resolveDeckDir}. */
export function currentDeckDirEnv(): DeckDirEnv {
  return {
    platform: process.platform,
    env: {
      CUEDECK_DIR: process.env[DECK_DIR_ENV],
      APPDATA: process.env.APPDATA,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      HOME: process.env.HOME
    },
    home: homedir()
  }
}

/**
 * Replicate Electron's base `appData` directory for the current platform. This
 * is the parent of the app's `userData` folder (which appends the app name).
 */
export function appDataDir(env: DeckDirEnv): string {
  const home = env.env.HOME || env.home
  switch (env.platform) {
    case 'win32':
      // %APPDATA% is normally always set on Windows; fall back to the standard
      // Roaming location if it somehow isn't.
      return env.env.APPDATA || join(home, 'AppData', 'Roaming')
    case 'darwin':
      return join(home, 'Library', 'Application Support')
    default:
      // Linux / other unixes: honor XDG, else ~/.config (Electron's behavior).
      return env.env.XDG_CONFIG_HOME || join(home, '.config')
  }
}

/**
 * Replicate `app.getPath('userData')`: the base `appData` directory joined with
 * the app name.
 */
export function userDataDir(env: DeckDirEnv = currentDeckDirEnv()): string {
  return join(appDataDir(env), APP_NAME)
}

/**
 * Resolve the directory that holds deck files.
 *
 * Precedence: explicit `overrideDir` → `CUEDECK_DIR` → the replicated Electron
 * `userData/decks`. An override points directly at the decks directory; the
 * default appends the `decks` subdir under `userData`.
 *
 * @param overrideDir value of the CLI `--dir` flag, if provided.
 * @param env         injectable environment (defaults to the live process).
 */
export function resolveDeckDir(
  overrideDir?: string,
  env: DeckDirEnv = currentDeckDirEnv()
): string {
  if (overrideDir && overrideDir.trim().length > 0) return overrideDir
  const fromEnv = env.env.CUEDECK_DIR
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv
  return join(userDataDir(env), DECKS_SUBDIR)
}
