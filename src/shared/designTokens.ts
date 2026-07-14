/**
 * CueDeck Studio design-system tokens (#32).
 *
 * These are the *semantic* design tokens shared across the renderer UI. They are
 * intentionally plain data (no React, no DOM) so they can be unit-tested and
 * referenced from anywhere. The concrete color values live as CSS custom
 * properties in `src/renderer/src/styles/index.css` (redefined per theme); this
 * module names the tokens and the finite set of interaction/status states that
 * every shared primitive must support.
 *
 * The goal is a single source of truth: a primitive declares which token it
 * uses, and the theme decides what that token looks like in dark vs light.
 */

/** Semantic status channels used for feedback (badges, toasts, field errors). */
export const STATUS_TONES = ['neutral', 'success', 'warning', 'error', 'info'] as const
export type StatusTone = (typeof STATUS_TONES)[number]

/** Interaction states every interactive primitive must render distinctly. */
export const INTERACTION_STATES = [
  'default',
  'hover',
  'pressed',
  'focus',
  'disabled'
] as const
export type InteractionState = (typeof INTERACTION_STATES)[number]

/** The CSS custom property that carries a status tone's foreground color. */
export function statusColorVar(tone: StatusTone): string {
  return `var(--deck-status-${tone})`
}

/** The CSS custom property that carries a status tone's subtle surface tint. */
export function statusSurfaceVar(tone: StatusTone): string {
  return `var(--deck-status-${tone}-surface)`
}

/**
 * Shared radius scale (px). Kept small and deliberate so the app reads as one
 * system rather than a grab-bag of corner sizes.
 */
export const RADII = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999
} as const
export type RadiusToken = keyof typeof RADII

/**
 * Shared spacing scale (px) — a 4px base grid. Primitives use these instead of
 * ad-hoc padding so density stays consistent across surfaces.
 */
export const SPACING = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32
} as const
export type SpacingToken = keyof typeof SPACING

/**
 * The single focus-ring recipe. Every focusable primitive uses this so keyboard
 * focus is unmistakable and identical everywhere (an accessibility requirement).
 * Expressed as Tailwind utility classes driven by the `--deck-accent` token.
 */
export const FOCUS_RING_CLASS =
  'outline-none focus-visible:ring-2 focus-visible:ring-deck-accent focus-visible:ring-offset-2 focus-visible:ring-offset-deck-bg'
