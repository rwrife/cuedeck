import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { buttonClasses, type ButtonClassOptions } from '../../lib/ui/variants'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonClassOptions {
  /** Optional leading icon (rendered before the label). */
  icon?: ReactNode
}

/**
 * The shared labeled-button primitive (#32 design-system foundation).
 *
 * Wraps {@link buttonClasses} so every button in the app shares the same
 * default/hover/pressed/focus-visible/disabled states, with `variant` picking
 * the resting look (primary/secondary/ghost/danger) and `active` overriding
 * to a solid "pressed"/selected fill for toggle-style actions (e.g. a Pin or
 * Live indicator that's currently on).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, active, activeTone, icon, className, children, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(buttonClasses({ variant, size, active, activeTone }), className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})
