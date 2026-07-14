/**
 * Pure, DOM-free helpers for the CueDeck Studio shell's workspace-mode model
 * (#33).
 *
 * The Studio shell organizes the app around four explicit modes — Library,
 * Build, Rehearse, and Present — instead of a single always-visible editor.
 * All of the mode-availability and transition *decisions* live here so they
 * can be unit-tested without React, Zustand, or Electron; the renderer store
 * and shell components only need to call these functions and apply the
 * result.
 */

/** The four Studio workspace modes, in their natural Library → … → Present order. */
export type WorkspaceMode = 'library' | 'build' | 'rehearse' | 'present'

/** All workspace modes, in Library → Build → Rehearse → Present order (mode-rail order). */
export const WORKSPACE_MODES: readonly WorkspaceMode[] = ['library', 'build', 'rehearse', 'present']

/**
 * Whether a mode needs an open deck to make sense. Library is the only mode
 * that's meaningful with no deck loaded — Build, Rehearse, and Present all
 * operate on the current deck.
 */
export function requiresOpenDeck(mode: WorkspaceMode): boolean {
  return mode !== 'library'
}

/**
 * Whether `mode` can currently be entered/shown as active, given whether a
 * deck is open. Library is always available; the deck-specific modes are
 * only available once a deck is open.
 */
export function isModeAvailable(mode: WorkspaceMode, hasDeck: boolean): boolean {
  return hasDeck || !requiresOpenDeck(mode)
}

/**
 * Guard for mode-rail navigation: resolve the mode to land on when the user
 * requests `target` from `current`. Returns `target` unchanged when it's
 * available, or `current` (a no-op) when it isn't — e.g. clicking "Build" in
 * the rail with no deck open leaves the shell exactly where it was.
 */
export function resolveModeSelection(
  target: WorkspaceMode,
  current: WorkspaceMode,
  hasDeck: boolean
): WorkspaceMode {
  return isModeAvailable(target, hasDeck) ? target : current
}

/** Mode to land on immediately after opening or creating a deck. */
export function modeAfterOpenDeck(): WorkspaceMode {
  return 'build'
}

/** Mode to land on after closing the active deck. */
export function modeAfterCloseDeck(): WorkspaceMode {
  return 'library'
}

/**
 * Mode to land on when entering Present. A no-op (returns `current`
 * unchanged) when no deck is open — Present can't be entered without one.
 */
export function modeAfterEnterPresent(current: WorkspaceMode, hasDeck: boolean): WorkspaceMode {
  return hasDeck ? 'present' : current
}

/**
 * Mode to land on when exiting Present: always back to Rehearse. A no-op
 * when `current` isn't actually Present.
 */
export function modeAfterExitPresent(current: WorkspaceMode): WorkspaceMode {
  return current === 'present' ? 'rehearse' : current
}

/**
 * The one clear "primary next action" for a mode (Information Architecture:
 * the active mode and the next logical step should always be obvious).
 * Returns the mode that action leads to, or `null` when the mode has no
 * single next-mode action (Library offers several equally-valid choices;
 * Present has no "next mode", only Exit).
 */
export function primaryActionMode(mode: WorkspaceMode): WorkspaceMode | null {
  switch (mode) {
    case 'build':
      return 'rehearse'
    case 'rehearse':
      return 'present'
    default:
      return null
  }
}
