/**
 * Pure array-reordering helpers shared across processes.
 *
 * Kept dependency-free and side-effect-free so they can be unit tested in a
 * plain Node environment (see `test/reorder.test.ts`) and reused by the
 * Zustand store actions that power drag-and-drop reordering.
 */

/**
 * Return a new array with the item at `from` moved to `to`.
 *
 * Indices are clamped into range, so out-of-bounds callers get a safe copy
 * rather than a thrown error or an array with `undefined` holes. When the move
 * is a no-op (same clamped position, or an array too small to reorder) the
 * original array reference is returned unchanged, which lets callers skip
 * needless re-renders / saves.
 */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (items.length < 2) return items as T[]

  const lastIndex = items.length - 1
  const src = clamp(from, 0, lastIndex)
  const dest = clamp(to, 0, lastIndex)
  if (src === dest) return items as T[]

  const next = items.slice()
  const [moved] = next.splice(src, 1)
  next.splice(dest, 0, moved)
  return next
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
