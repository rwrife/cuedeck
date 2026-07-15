import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { buttonClasses, type ButtonClassOptions } from '../../lib/ui/variants'
import { Tooltip } from './Tooltip'

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>,
    ButtonClassOptions {
  /** Required accessible name — icon-only controls have no visible label. */
  label: string
  icon: ReactNode
  /** Skip the hover/focus tooltip (the accessible name is still set). */
  hideTooltip?: boolean
}

/**
 * Icon-only button primitive (#32 design-system foundation).
 *
 * Every icon-only control needs an accessible name and a practical hit
 * target; this wrapper makes both the default rather than something each
 * call site has to remember. `label` becomes the `aria-label` and — unless
 * `hideTooltip` is set — the text of a themed {@link ./Tooltip}, so hover,
 * focus, and touch all get a consistent, on-brand hint instead of the
 * inconsistent native `title` tooltip. The icon itself stays `aria-hidden`
 * (see {@link ./icons}).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    active,
    activeTone,
    className,
    hideTooltip,
    title,
    type = 'button',
    ...rest
  },
  ref
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(
        buttonClasses({ variant, size, active, activeTone }),
        // Square hit target sized to at least a comfortable tap area.
        size === 'sm' ? 'h-7 w-7 !px-0' : 'h-8 w-8 !px-0',
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  )

  if (hideTooltip) return button
  return <Tooltip label={title ?? label}>{button}</Tooltip>
})

