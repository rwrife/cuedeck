/**
 * Pure keyboard-navigation logic for {@link ../components/ui/Menu} (#34
 * Library), extracted so the ARIA `menu` roving-focus pattern —
 * ArrowDown/ArrowUp move focus to the next/previous item, wrapping at the
 * ends — can be unit tested without rendering React.
 *
 * See https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ for the pattern.
 */

export type MenuNavKey = 'ArrowDown' | 'ArrowUp'

/** Type guard for the keys {@link getNextMenuIndex} understands. */
export function isMenuNavKey(key: string): key is MenuNavKey {
  return key === 'ArrowDown' || key === 'ArrowUp'
}

/**
 * Given the currently-focused item index (-1 if none/not found) and a
 * navigation key, returns the index that should be focused next, wrapping
 * around at either end. Returns `null` for an empty menu.
 */
export function getNextMenuIndex(key: MenuNavKey, currentIndex: number, length: number): number | null {
  if (length <= 0) return null
  const direction = key === 'ArrowDown' ? 1 : -1
  return (currentIndex + direction + length) % length
}
