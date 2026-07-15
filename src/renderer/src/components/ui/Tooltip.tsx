import { Children, cloneElement, isValidElement, useId } from 'react'
import type { ReactElement } from 'react'
import { cx } from '../../lib/ui/classNames'

export interface TooltipProps {
  /** The tooltip text, also used as the accessible description. */
  label: string
  /** A single focusable child (button, link, …) that triggers the tooltip. */
  children: ReactElement
  className?: string
}

/**
 * Shared tooltip primitive (#32 design-system foundation).
 *
 * A small, theme-matched label shown on hover *and* keyboard focus (via
 * `group-focus-within`), unlike the browser's native `title` attribute which
 * is inconsistently reachable by keyboard/touch and can't be themed. Purely
 * CSS-driven — no positioning JS — so it stays lightweight; it always renders
 * below its trigger.
 */
export function Tooltip({ label, children, className }: TooltipProps): JSX.Element {
  const id = useId()
  const child = Children.only(children)
  const trigger = isValidElement(child)
    ? cloneElement(child, { 'aria-describedby': id } as Record<string, unknown>)
    : child

  return (
    <span className={cx('group relative inline-flex', className)}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cx(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap',
          'rounded-md border border-deck-border bg-deck-card px-2 py-1 text-xs text-deck-text shadow-lg',
          'opacity-0 transition-opacity motion-reduce:transition-none',
          'group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        {label}
      </span>
    </span>
  )
}
