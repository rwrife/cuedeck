import type { ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastProps {
  /** The (already human-readable) message announced and shown. */
  message: ReactNode
  /** Optional primary action (e.g. Undo). */
  action?: ToastAction
  /** Dismiss (close) handler for the trailing ✕. */
  onDismiss: () => void
  /**
   * `aria-live` politeness. Defaults to `'polite'` — a toast is informational
   * and must never steal focus or interrupt the screen reader.
   */
  live?: 'polite' | 'assertive'
  className?: string
}

/**
 * Shared bottom-anchored toast (#38 toast/undo pattern).
 *
 * A lightweight, accessible transient surface for reversible actions: it pairs
 * a short message with an optional action (typically "Undo") and an explicit
 * dismiss. `role="status"` + `aria-live` announces the message to screen
 * readers without stealing focus, and the action/dismiss controls are ordinary
 * keyboard-reachable buttons — so an undo is operable without a mouse and its
 * meaning is never conveyed by color alone. Built from the existing
 * {@link Button}/{@link IconButton} primitives; the owning component controls
 * visibility and any auto-dismiss timing.
 */
export function Toast({
  message,
  action,
  onDismiss,
  live = 'polite',
  className
}: ToastProps): JSX.Element {
  return (
    <div
      role="status"
      aria-live={live}
      className={cx(
        'pointer-events-auto flex items-center gap-3 rounded-lg border border-deck-border ' +
          'bg-deck-panel px-4 py-2.5 text-sm text-deck-text shadow-2xl',
        className
      )}
    >
      <span className="min-w-0 break-words">{message}</span>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="shrink-0">
          {action.label}
        </Button>
      )}
      <IconButton
        label="Dismiss"
        icon={<CloseIcon />}
        size="sm"
        onClick={onDismiss}
        className="shrink-0"
        hideTooltip
      />
    </div>
  )
}
