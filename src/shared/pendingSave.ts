import type { Deck } from './types'

/**
 * Dependencies needed to flush a pending debounced deck save. Injected so the
 * flush decision/orchestration is testable without real timers or Electron
 * IPC — mirrors the DI pattern used by other side-effecting-but-pure-shaped
 * helpers in this codebase (e.g. `prefersReducedMotion`, `getFocusableElements`).
 */
export interface PendingSaveDeps {
  /** Whether a save is currently scheduled (debounce timer pending). */
  hasPendingSave: () => boolean
  /** Cancel the pending scheduled save, if any. */
  cancelPendingSave: () => void
  /** Persist a deck immediately, resolving to the persisted result. */
  save: (deck: Deck) => Promise<Deck>
}

/**
 * Flush a pending debounced save before the active deck changes. Cancels the
 * scheduled timer and immediately persists `deck` when (and only when) a save
 * was pending; a no-op — returning `null` — otherwise.
 *
 * Used before `openDeck`/`createDeck` replace the current deck (#33): Library
 * stays reachable without closing the open deck, so switching to a different
 * deck must not race the 500ms debounce window and silently drop the
 * outgoing deck's last edit.
 */
export async function flushPendingSave(
  deck: Deck | null,
  deps: PendingSaveDeps
): Promise<Deck | null> {
  if (!deck || !deps.hasPendingSave()) return null
  // Cancel first so the debounce timer can never fire concurrently with (or
  // after) this immediate save.
  deps.cancelPendingSave()
  return deps.save(deck)
}
