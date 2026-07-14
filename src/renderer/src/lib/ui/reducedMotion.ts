/**
 * `prefers-reduced-motion` helper (#32 design-system foundation).
 *
 * Accepts an optional injected `{ matches }` object (a `MediaQueryList` or a
 * plain test double) so the decision logic is unit-testable without a DOM.
 * Falls back to `window.matchMedia` when available, and to `false` (motion
 * allowed) when neither is present — e.g. during SSR-less unit tests.
 */
export interface ReducedMotionQuery {
  matches: boolean
}

export function prefersReducedMotion(query?: ReducedMotionQuery | null): boolean {
  if (query) return query.matches
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
