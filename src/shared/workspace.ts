/**
 * Pure, DOM-free helpers for the CueDeck Studio shell (#33).
 *
 * The Studio shell frames the whole app around four explicit workspace modes.
 * `library` is always available; `build`, `rehearse`, and `present` are
 * deck-specific and only reachable while a deck is open. The rendering lives in
 * the renderer and the window side effects live in the main process, but the
 * small pieces of transition logic live here so they can be unit-tested without
 * Electron or a DOM.
 */

import type { DeckMode } from './presenter'

/** The four Studio workspace modes. */
export type WorkspaceMode = 'library' | 'build' | 'rehearse' | 'present'

/** The Studio workspace modes in their canonical rail order. */
export const WORKSPACE_MODES: readonly WorkspaceMode[] = [
  'library',
  'build',
  'rehearse',
  'present'
] as const

/** Human-facing metadata for each workspace mode (label + one-line hint). */
export interface WorkspaceModeInfo {
  readonly mode: WorkspaceMode
  readonly label: string
  /** Short description used for tooltips and screen-reader hints. */
  readonly hint: string
  /** True when the mode requires an open deck (disabled in the Library). */
  readonly deckSpecific: boolean
}

/** Static, ordered descriptions of every workspace mode. */
export const WORKSPACE_MODE_INFO: readonly WorkspaceModeInfo[] = [
  {
    mode: 'library',
    label: 'Library',
    hint: 'Browse, create, import, and open decks.',
    deckSpecific: false
  },
  {
    mode: 'build',
    label: 'Build',
    hint: 'Author cards, snippets, and variables.',
    deckSpecific: true
  },
  {
    mode: 'rehearse',
    label: 'Rehearse',
    hint: 'Practice the running order before going live.',
    deckSpecific: true
  },
  {
    mode: 'present',
    label: 'Present',
    hint: 'Compact, always-on-top demo view.',
    deckSpecific: true
  }
] as const

/** True when a workspace mode is only reachable while a deck is open. */
export function isDeckSpecificMode(mode: WorkspaceMode): boolean {
  return mode !== 'library'
}

/**
 * Decide whether a target workspace mode may be entered given whether a deck is
 * currently open. The Library is always reachable; every other mode requires an
 * open deck. Used to disable/enable the mode rail and to guard transitions.
 */
export function canEnterMode(mode: WorkspaceMode, hasDeck: boolean): boolean {
  return mode === 'library' ? true : hasDeck
}

/**
 * Resolve the next workspace mode for a requested navigation, clamping illegal
 * transitions back to a safe mode. When no deck is open, any deck-specific
 * request collapses to `library`. Otherwise the request is honored.
 */
export function resolveModeRequest(request: WorkspaceMode, hasDeck: boolean): WorkspaceMode {
  return canEnterMode(request, hasDeck) ? request : 'library'
}

/**
 * The workspace mode entered when a deck is opened. Opening a deck always moves
 * the user from the Library into the Build workspace (acceptance criteria).
 */
export function modeAfterOpenDeck(): WorkspaceMode {
  return 'build'
}

/**
 * The workspace mode entered when the active deck is closed. Closing a deck
 * always returns to the Library (acceptance criteria).
 */
export function modeAfterCloseDeck(): WorkspaceMode {
  return 'library'
}

/**
 * The workspace mode entered when the user exits Present. Present exits back to
 * Rehearse (acceptance criteria) so the presenter lands in the practice view
 * with the window bounds + always-on-top state restored by the main process.
 */
export function modeAfterExitPresent(): WorkspaceMode {
  return 'rehearse'
}

/**
 * Map a Studio workspace mode to the lower-level window {@link DeckMode} that
 * drives the compact, always-on-top presenter window. Only `present` uses the
 * `'present'` window layout; every other workspace mode uses the full-chrome
 * `'edit'` window. This keeps the existing presenter window IPC and the
 * live-control bridge (which speaks in `DeckMode`) unchanged.
 */
export function windowModeFor(mode: WorkspaceMode): DeckMode {
  return mode === 'present' ? 'present' : 'edit'
}
