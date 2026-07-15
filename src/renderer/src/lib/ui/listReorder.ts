/**
 * Keyboard reordering helpers (#39 accessibility pass).
 *
 * The Build running-order (steps) and paste-ready-content lists could
 * previously only be reordered by mouse drag-and-drop, so a keyboard-only user
 * could never change their order. These pure helpers back an Alt+ArrowUp /
 * Alt+ArrowDown "move the focused item" affordance on those lists — the same
 * pattern this codebase already uses for its other keyboard behaviors
 * ({@link ./menuNav}, {@link ./segmentedControlNav}): a small, DOM-free key
 * mapping that is unit-tested in isolation, then wired into the component.
 *
 * Alt is required so plain ArrowUp/ArrowDown stay free for normal navigation
 * and never get hijacked into a destructive reorder.
 */

/** The minimal shape {@link isReorderKey} needs from a keyboard event. */
export interface ReorderKeyEvent {
  key: string
  altKey: boolean
}

/** True only for Alt+ArrowUp / Alt+ArrowDown — the reorder gesture. */
export function isReorderKey(e: ReorderKeyEvent): boolean {
  return e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
}

/**
 * The index an item at `index` should move to for the given arrow `key`, or
 * `null` when the move isn't possible (already at the relevant end, an
 * out-of-range index, or a non-reorder key). Deliberately does NOT wrap: an
 * item shouldn't jump from the top of the list to the bottom on one keypress.
 */
export function getReorderTargetIndex(
  key: string,
  index: number,
  count: number
): number | null {
  if (index < 0 || index >= count) return null
  if (key === 'ArrowUp') return index > 0 ? index - 1 : null
  if (key === 'ArrowDown') return index < count - 1 ? index + 1 : null
  return null
}
