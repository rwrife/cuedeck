import { useRef, useState } from 'react'

/**
 * A two-step delete control (#38): the first click reveals an inline
 * "Delete?/Cancel" confirmation instead of destroying content on a single quiet
 * click. This guards primary content objects (steps, paste-ready blocks) so
 * they never disappear without an explicit confirm.
 *
 * Accessibility (#38 acceptance criteria):
 * - The confirm affordance is keyboard reachable and auto-focuses so Enter
 *   confirms and Escape cancels.
 * - After confirming OR cancelling, focus returns to a predictable target: the
 *   original trigger when it still exists (cancel), else the caller-provided
 *   fallback (delete) so keyboard users are never stranded.
 */
export function ConfirmDeleteButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Delete?',
  title,
  className = 'rounded px-2 py-1 text-sm text-deck-muted transition hover:text-red-400',
  /** Focused after a confirmed delete removes the trigger from the DOM. */
  restoreFocus
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  title?: string
  className?: string
  restoreFocus?: () => void
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        onClick={() => setConfirming(true)}
        className={className}
        title={title}
      >
        {label}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1" role="group" aria-label={`Confirm ${label.toLowerCase()}`}>
      <button
        autoFocus
        onClick={() => {
          setConfirming(false)
          onConfirm()
          // The trigger is gone once the object is deleted; hand focus to the
          // caller-provided predictable target so keyboard users keep context.
          restoreFocus?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setConfirming(false)
            triggerRef.current?.focus()
          }
        }}
        className="rounded bg-deck-status-error px-2 py-1 text-sm font-semibold text-white transition hover:opacity-90"
        title={title}
      >
        {confirmLabel}
      </button>
      <button
        onClick={() => {
          setConfirming(false)
          triggerRef.current?.focus()
        }}
        className="rounded px-2 py-1 text-sm text-deck-muted transition hover:text-deck-text"
      >
        Cancel
      </button>
    </span>
  )
}
