/**
 * Save-status state machine for CueDeck decks (#38).
 *
 * Persistence in the renderer is debounced: any edit schedules a save a short
 * while later. This module models the *visible* status of that pipeline so the
 * UI can honestly tell the user whether their work is on disk. It intentionally
 * has no DOM or IPC dependencies so the transitions are fully unit-testable and
 * shared identically across every surface that reports save state.
 *
 * The critical invariant (#38 acceptance criteria): a failed persistence must
 * NEVER be presented as "saved". The previous UI collapsed everything into a
 * boolean `saving`, so a rejected write silently flipped back to "Saved". The
 * `error` state below makes that impossible.
 */

/** Discrete phases of the deck persistence pipeline. */
export type SaveStatus =
  /** No unsaved edits; the on-disk copy matches the in-memory deck. */
  | 'saved'
  /** Edits have been made and a save is pending (debounced) or in flight. */
  | 'pending'
  /** A save is actively writing to disk. */
  | 'saving'
  /** The most recent save failed; unsaved changes remain in memory. */
  | 'error'

/** Full save state: the phase plus an optional human-readable error detail. */
export interface SaveState {
  status: SaveStatus
  /** Populated only when {@link status} is `error`. */
  error: string | null
}

/** The initial state for a freshly opened (clean) deck. */
export const initialSaveState: SaveState = { status: 'saved', error: null }

/**
 * An edit was made: the deck is now dirty and a save is scheduled. Any prior
 * error is cleared because we are about to try again — but the deck is not yet
 * "saved", so this never masks a failure as success.
 */
export function markDirty(): SaveState {
  return { status: 'pending', error: null }
}

/** A save write has started. */
export function markSaving(): SaveState {
  return { status: 'saving', error: null }
}

/**
 * A save write completed successfully. Returns to `saved` UNLESS more edits
 * arrived while the write was in flight (the caller passes `stillDirty: true`),
 * in which case we stay `pending` so the trailing edit is not shown as saved.
 */
export function markSaved(stillDirty = false): SaveState {
  return stillDirty ? { status: 'pending', error: null } : { status: 'saved', error: null }
}

/**
 * A save write failed. The deck keeps its unsaved changes and the error is
 * surfaced so it can never be mistaken for a successful save.
 */
export function markError(message: string): SaveState {
  return { status: 'error', error: message || 'Save failed.' }
}

/** True when there are edits that are not yet safely on disk. */
export function isUnsaved(state: SaveState): boolean {
  return state.status !== 'saved'
}

/** True when a flush is worthwhile before closing/navigating (#38). */
export function needsFlush(state: SaveState): boolean {
  return state.status === 'pending' || state.status === 'saving' || state.status === 'error'
}

/**
 * A short, accessible label for the current save state. Never relies on color
 * alone (#38 acceptance criteria) — the words themselves convey the state, so
 * an `aria-live` region can announce them verbatim.
 */
export function saveStatusLabel(state: SaveState): string {
  switch (state.status) {
    case 'saved':
      return 'Saved'
    case 'pending':
      return 'Unsaved changes…'
    case 'saving':
      return 'Saving…'
    case 'error':
      return state.error ? `Not saved — ${state.error}` : 'Not saved'
  }
}
