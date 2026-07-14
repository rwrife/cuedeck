/**
 * Focus-trap helpers for the shared {@link ../../components/ui/Dialog} shell
 * (#32 design-system foundation). `getFocusableElements` is a thin,
 * dependency-injectable wrapper around `querySelectorAll` so the selector and
 * filtering behavior can be unit-tested without a real DOM.
 */

/** Elements a dialog should include when trapping Tab/Shift+Tab focus. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** The minimal shape {@link getFocusableElements} needs from a container —
 *  satisfied by `HTMLElement`/`Document`, and by plain test doubles. */
export interface FocusQueryable {
  querySelectorAll(selector: string): ArrayLike<HTMLElement>
}

export function getFocusableElements(
  container: FocusQueryable | null | undefined
): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
}
