import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@shared/buttonClasses'
import { Icon } from './Icon'
import type { IconName } from '@shared/icons'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Optional leading icon from the shared registry (decorative next to text). */
  leadingIcon?: IconName
  /** Optional trailing icon from the shared registry (decorative next to text). */
  trailingIcon?: IconName
}

/**
 * Shared button primitive (#32) with consistent default/hover/pressed/focus/
 * disabled states across every surface. Defaults `type="button"` so buttons
 * inside forms never submit by accident.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, leadingIcon, trailingIcon, className, children, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {leadingIcon && <Icon name={leadingIcon} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} />}
    </button>
  )
})
