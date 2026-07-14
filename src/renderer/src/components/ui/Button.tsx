import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { buttonClasses, resolveAriaPressed, type ButtonClassOptions } from '../../lib/ui/variants'

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
 * Live indicator that's currently on). When `active` is explicitly supplied
 * the button is a toggle, so its state is also announced via `aria-pressed`
 * (see {@link resolveAriaPressed}); ordinary buttons that never pass `active`
 * don't get `aria-pressed` at all.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    active,
    activeTone,
    icon,
    className,
    children,
    type = 'button',
    'aria-pressed': ariaPressed,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={resolveAriaPressed(active, ariaPressed)}
      className={cx(buttonClasses({ variant, size, active, activeTone }), className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})
