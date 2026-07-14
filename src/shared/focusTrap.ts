/**
 * Pure, DOM-free focus-trap helpers (#39).
 *
 * Modal dialogs and menus must keep keyboard focus inside themselves while open
 * and restore focus to whatever was focused before they opened once they close.
 * The DOM wiring lives in the renderer's `useFocusTrap` hook, but the small
 * decision — "given the tabbable elements and where focus is, where should Tab
 * move next?" — lives here so it can be unit-tested in the node vitest env
 * without a browser.
 *
 * These helpers operate on plain indices into an ordered list of tabbable
 * elements, so the hook can gather elements however it likes (e.g.
 * `querySelectorAll`) and defer the wrap-around logic to tested code.
 */

/**
 * The CSS selector the hook uses to gather tabbable elements inside a container.
 * Exported so both the hook and its documentation stay in sync. Elements that
 * are disabled, hidden, or explicitly removed from the tab order
 * (`tabindex="-1"`) are excluded.
 */
export const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * Given the number of tabbable elements, the index currently focused, and the
 * Tab direction, return the index that should receive focus next.
 *
 * - `count <= 0` → `null` (nothing to focus; the container itself should hold
 *   focus so the trap still swallows Tab).
 * - Focus wraps: tabbing forward off the last element lands on the first, and
 *   tabbing backward off the first lands on the last. This is what keeps focus
 *   trapped inside the dialog.
 * - When focus is currently outside the trap (`currentIndex < 0`), forward Tab
 *   enters at the first element and backward (Shift+Tab) enters at the last.
 *
 * `backward` is `true` for Shift+Tab.
 */
export function nextTrapIndex(
  count: number,
  currentIndex: number,
  backward: boolean
): number | null {
  if (count <= 0) return null
  if (count === 1) return 0

  if (currentIndex < 0 || currentIndex >= count) {
    return backward ? count - 1 : 0
  }

  const step = backward ? -1 : 1
  return (currentIndex + step + count) % count
}

/**
 * Decide whether a keydown event should be handled by the trap as a Tab move.
 *
 * Only a bare Tab / Shift+Tab counts; Tab combined with Ctrl/Meta/Alt is left
 * alone so OS- and app-level shortcuts keep working.
 */
export function isTrapTab(e: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): boolean {
  return e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey
}
