/**
 * Pure class-name computation for shared button primitives (#32).
 *
 * Kept separate from the React component so the variant → utility-class mapping
 * can be unit-tested without a DOM. Every returned class string is a static set
 * of Tailwind utilities resolving to the `deck-*` theme tokens, so buttons stay
 * legible and consistent across dark/light themes and expose distinct default,
 * hover, pressed (active), focus, and disabled states.
 */
import { FOCUS_RING_CLASS } from './designTokens'

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]

export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const
export type ButtonSize = (typeof BUTTON_SIZES)[number]

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  FOCUS_RING_CLASS +
  ' disabled:cursor-not-allowed disabled:opacity-50'

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base'
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Filled accent. `active:` = pressed state.
  primary:
    'bg-deck-accent text-white hover:bg-deck-accentHover active:bg-deck-accentHover ' +
    'disabled:hover:bg-deck-accent',
  // Bordered surface button.
  secondary:
    'border border-deck-border bg-deck-panel text-deck-text hover:border-deck-accent ' +
    'active:bg-deck-card disabled:hover:border-deck-border',
  // Chromeless — for dense toolbars and icon actions.
  ghost:
    'text-deck-muted hover:bg-deck-card hover:text-deck-text active:bg-deck-border ' +
    'disabled:hover:bg-transparent disabled:hover:text-deck-muted',
  // Destructive.
  danger:
    'border border-deck-border bg-deck-panel text-deck-status-error hover:border-deck-status-error ' +
    'active:bg-deck-card'
}

export interface ButtonClassOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Extra classes appended verbatim (caller-controlled layout tweaks). */
  className?: string
}

/**
 * Compose the full class string for a button of the given variant/size.
 * Deterministic and side-effect free.
 */
export function buttonClasses(options: ButtonClassOptions = {}): string {
  const { variant = 'primary', size = 'md', className } = options
  return [BASE, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className]
    .filter(Boolean)
    .join(' ')
}
