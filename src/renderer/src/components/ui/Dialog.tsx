import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { getFocusableElements } from '../../lib/ui/focusTrap'

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog (visually hidden if a visible heading is also rendered). */
  ariaLabel?: string
  /** Id of an element (e.g. the visible heading) that labels the dialog, instead of `ariaLabel`. */
  labelledBy?: string
  children: ReactNode
  className?: string
}

/**
 * Shared modal dialog shell (#32 design-system foundation).
 *
 * Centralizes the backdrop, `role="dialog"`/`aria-modal`, Escape-to-close,
 * backdrop-click-to-close, a basic Tab focus trap, and focus restoration —
 * behavior every ad hoc modal in the app (Settings, Live Control, …)
 * previously reimplemented slightly differently. Callers supply the header/
 * body/footer markup as children.
 */
export function Dialog({
  open,
  onClose,
  ariaLabel,
  labelledBy,
  children,
  className
}: DialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Focus the dialog (or its first focusable element) on open, and restore
  // focus to whatever was focused beforehand when it closes.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const [first] = getFocusableElements(panelRef.current)
    ;(first ?? panelRef.current)?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  // Basic Tab trap: wrap focus back to the first/last focusable element
  // rather than letting it escape into the app behind the dialog.
  function onKeyDownTrap(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return
    const focusable = getFocusableElements(panelRef.current)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDownTrap}
        className={cx(
          'w-full max-w-lg overflow-hidden rounded-2xl border border-deck-border bg-deck-panel shadow-2xl outline-none',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
