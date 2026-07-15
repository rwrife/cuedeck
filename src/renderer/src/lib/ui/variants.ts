import { cx } from './classNames'

/**
 * Shared class-name builders for the renderer's button/status primitives
 * (#32 design-system foundation). Pulled out as pure functions — rather than
 * inlined in JSX — so the "consistent default, hover, pressed, focus,
 * disabled, success, warning, and error states" acceptance criteria can be
 * unit-tested without rendering React.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'
/** Fill used when `active` is set, independent of `variant` (e.g. a toggled
 *  "Live" indicator turns solid green while a toggled "Pin" turns accent). */
export type ActiveTone = 'accent' | 'success'

export interface ButtonClassOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Renders a solid "pressed"/selected fill regardless of variant. */
  active?: boolean
  activeTone?: ActiveTone
}

/** Classes shared by every button-like control: layout, radius, transition,
 *  a strong focus-visible ring so keyboard focus is never invisible, and a
 *  disabled look keyed off the real `disabled` HTML attribute (no JS
 *  branching needed — Tailwind's `disabled:` variant reacts to it directly). */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-colors motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-deck-bg ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm'
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-deck-accent text-white hover:bg-deck-accentHover active:bg-deck-accentPressed',
  secondary:
    'border border-deck-border bg-deck-panel text-deck-text hover:border-deck-accent active:bg-deck-card',
  ghost: 'text-deck-muted hover:bg-deck-card hover:text-deck-text active:bg-deck-border/60',
  danger: 'bg-deck-danger text-white hover:bg-deck-dangerHover active:bg-deck-dangerHover'
}

const ACTIVE_FILL: Record<ActiveTone, string> = {
  accent: 'bg-deck-accent text-white hover:bg-deck-accentHover',
  success: 'bg-deck-success text-white hover:bg-deck-successHover'
}

export function buttonClasses(options: ButtonClassOptions = {}): string {
  const { variant = 'secondary', size = 'md', active = false, activeTone = 'accent' } = options
  return cx(BASE, SIZE[size], active ? ACTIVE_FILL[activeTone] : VARIANT[variant])
}

/** Semantic status tone, shared by {@link toneClasses} consumers (status
 *  banners, badges, and chips). */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const TONE: Record<Tone, string> = {
  neutral: 'border-deck-border bg-deck-panel text-deck-text',
  success: 'border-deck-success/40 bg-deck-success/10 text-deck-success',
  warning: 'border-deck-warning/40 bg-deck-warning/10 text-deck-warning',
  danger: 'border-deck-danger/40 bg-deck-danger/10 text-deck-danger',
  info: 'border-deck-accent/40 bg-deck-accent/10 text-deck-accentHover'
}

export function toneClasses(tone: Tone): string {
  return TONE[tone]
}

/** The subset of `aria-pressed` values React's typings accept on a button. */
export type AriaPressedValue = boolean | 'true' | 'false' | 'mixed' | undefined

/**
 * Resolves the `aria-pressed` value for a toggle-style {@link Button}.
 *
 * Ordinary buttons that never receive an `active` prop must not gain
 * `aria-pressed` at all (it's not a toggle). Buttons that do receive an
 * explicit `active` (true or false) are toggles and must announce their
 * state via `aria-pressed`. A caller-supplied `aria-pressed` always wins,
 * so call sites can opt into `"mixed"` or override the derived value.
 */
export function resolveAriaPressed(
  active: boolean | undefined,
  explicitAriaPressed: AriaPressedValue
): AriaPressedValue {
  if (explicitAriaPressed !== undefined) return explicitAriaPressed
  return active
}

/**
 * Resolves the `aria-disabled` value for a control that must stay in the tab
 * order while unavailable, so keyboard users can still focus it and read its
 * accessible name/description (e.g. a tooltip explaining why). Prefer this
 * over the native `disabled` attribute — which removes a control from the
 * tab order entirely — whenever the reason it's unavailable needs to be
 * discoverable, not just visible.
 *
 * Callers still must guard the control's activation handler themselves
 * (`aria-disabled` has no built-in effect on click/keydown behavior).
 */
export function resolveAriaDisabled(available: boolean): true | undefined {
  return available ? undefined : true
}
