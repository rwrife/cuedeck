import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cx } from '../../lib/ui/classNames'

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

const BASE =
  'w-full resize-y rounded-lg border border-deck-border bg-deck-panel p-3 text-sm text-deck-text ' +
  'outline-none placeholder:text-deck-muted transition-colors motion-reduce:transition-none ' +
  'focus-visible:ring-2 focus-visible:ring-deck-accent focus-visible:border-deck-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Shared multi-line text area (#32 design-system foundation), matching
 * {@link ./TextField}'s border/focus/disabled states so authoring surfaces
 * stay visually consistent between single- and multi-line inputs.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cx(BASE, className)} {...rest} />
})
