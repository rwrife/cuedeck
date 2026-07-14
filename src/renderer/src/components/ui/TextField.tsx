import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from '../../lib/ui/classNames'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the warning border/ring used to flag invalid or unset values. */
  invalid?: boolean
}

const BASE =
  'rounded-lg border bg-deck-panel px-3 py-2 text-sm text-deck-text outline-none ' +
  'placeholder:text-deck-muted transition-colors motion-reduce:transition-none ' +
  'focus-visible:ring-2 focus-visible:ring-deck-accent disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Shared single-line text input (#32 design-system foundation). Consistent
 * border, focus-visible ring, and disabled/invalid states so authoring
 * surfaces don't each hand-roll input styling.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { invalid, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        BASE,
        invalid ? 'border-deck-warning focus-visible:ring-deck-warning' : 'border-deck-border focus-visible:border-deck-accent',
        className
      )}
      {...rest}
    />
  )
})
