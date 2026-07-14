import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@shared/buttonClasses'
import { Icon } from './Icon'
import { getIcon, type IconName } from '@shared/icons'

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName
  /**
   * Required accessible name. Icon-only controls have no visible text, so an
   * explicit label is mandatory — the shared registry provides a sensible
   * default, but callers should pass a context-specific one when it helps.
   */
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon glyph size in px. Defaults to 18 for comfortable hit targets. */
  iconSize?: number
}

const SQUARE_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0',
  md: 'h-9 w-9 p-0',
  lg: 'h-10 w-10 p-0'
}

/**
 * Icon-only button (#32). Enforces an accessible name and a practical minimum
 * hit target (32–40px square), so important icon actions are usable by pointer,
 * touch, and screen reader alike.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', iconSize = 18, className, title, ...rest },
  ref
) {
  const accessibleName = label ?? getIcon(icon)?.defaultLabel ?? icon
  return (
    <button
      ref={ref}
      type="button"
      aria-label={accessibleName}
      title={title ?? accessibleName}
      className={buttonClasses({ variant, size, className: `${SQUARE_SIZE[size]} ${className ?? ''}`.trim() })}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
})
