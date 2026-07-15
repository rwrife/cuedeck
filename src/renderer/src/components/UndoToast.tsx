import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { Toast } from './ui/Toast'

/** How long an undo stays offered before auto-dismissing (ms). */
export const UNDO_TOAST_MS = 8000

/**
 * App-level undo toast (#38 safe destructive actions).
 *
 * Renders the store's single pending {@link useDeckStore.undo} entry — set when
 * a step, a piece of paste-ready content, or a variable is deleted — as an
 * accessible toast offering one-click Undo. Deletion is immediate (and already
 * persisted), so no primary content object silently vanishes: the user always
 * gets a visible, keyboard-operable chance to restore it, and Undo returns a
 * predictable focus target via the store's focus one-shots. Auto-dismisses
 * after {@link UNDO_TOAST_MS}; dismissing only drops the offer, it never
 * re-deletes anything.
 */
export function UndoToast(): JSX.Element | null {
  const undo = useDeckStore((s) => s.undo)
  const undoLastDelete = useDeckStore((s) => s.undoLastDelete)
  const dismissUndo = useDeckStore((s) => s.dismissUndo)

  // Auto-dismiss the current offer after a while. Keyed on the entry identity so
  // each new deletion restarts the window rather than inheriting a stale timer.
  useEffect(() => {
    if (!undo) return
    const id = window.setTimeout(dismissUndo, UNDO_TOAST_MS)
    return () => window.clearTimeout(id)
  }, [undo, dismissUndo])

  if (!undo) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <Toast
        message={undo.label}
        action={{ label: 'Undo', onClick: undoLastDelete }}
        onDismiss={dismissUndo}
      />
    </div>
  )
}
