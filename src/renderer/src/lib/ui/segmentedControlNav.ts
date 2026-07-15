/**
 * Pure keyboard-navigation logic for {@link ../components/ui/SegmentedControl}
 * (#32 design-system foundation), extracted so the ARIA `radiogroup` roving-
 * tabindex pattern — ArrowLeft/ArrowRight/ArrowUp/ArrowDown move focus and
 * selection to the adjacent option (wrapping at the ends), Home/End jump to
 * the first/last option, and disabled options are skipped — can be unit
 * tested without rendering React.
 *
 * See https://www.w3.org/WAI/ARIA/apg/patterns/radio/ for the pattern.
 */

export type SegmentedNavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

const NAV_KEYS: readonly SegmentedNavKey[] = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End'
]

/** Type guard for the keys {@link getNextSegmentIndex} understands. */
export function isSegmentedNavKey(key: string): key is SegmentedNavKey {
  return (NAV_KEYS as readonly string[]).includes(key)
}

/**
 * Given the currently-selected index and a navigation key, returns the index
 * that should become focused + selected next, or `null` if no option can be
 * selected (an empty list, or every option disabled).
 *
 * @param isDisabled - predicate for whether the option at a given index is
 *   disabled; disabled options are skipped when moving and when jumping to
 *   Home/End. Defaults to "nothing is disabled".
 */
export function getNextSegmentIndex(
  key: SegmentedNavKey,
  currentIndex: number,
  length: number,
  isDisabled: (index: number) => boolean = () => false
): number | null {
  if (length <= 0) return null

  const enabledIndexes: number[] = []
  for (let i = 0; i < length; i++) {
    if (!isDisabled(i)) enabledIndexes.push(i)
  }
  if (enabledIndexes.length === 0) return null

  if (key === 'Home') return enabledIndexes[0]
  if (key === 'End') return enabledIndexes[enabledIndexes.length - 1]

  const direction = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
  let next = currentIndex
  for (let step = 0; step < length; step++) {
    next = (next + direction + length) % length
    if (!isDisabled(next)) return next
  }
  return null
}
