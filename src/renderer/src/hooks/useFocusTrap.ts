import { useEffect, useRef } from 'react'
import { TABBABLE_SELECTOR, isTrapTab, nextTrapIndex } from '@shared/focusTrap'

/**
 * Trap keyboard focus inside a dialog/menu while it is open, and restore focus
 * to the previously-focused element when it closes (#39).
 *
 * Returns a ref to attach to the trap container. While `active` is true the
 * hook:
 *  - remembers the element that had focus before the trap engaged,
 *  - moves focus into the container (preferring an element the caller marked
 *    with `data-autofocus`, otherwise the first tabbable element, otherwise the
 *    container itself),
 *  - intercepts Tab / Shift+Tab and cycles focus within the container so it can
 *    never escape, and
 *  - on teardown, returns focus to the remembered element if it is still in the
 *    document.
 *
 * The wrap-around decision lives in the pure, unit-tested `@shared/focusTrap`
 * helpers; this hook only does the DOM plumbing.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean): React.RefObject<T> {
  const containerRef = useRef<T>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    // Remember where focus was so we can restore it on close.
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    function tabbables(): HTMLElement[] {
      if (!container) return []
      return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
    }

    // Move focus inside: prefer an explicit autofocus target, then the first
    // tabbable, then the container itself (made focusable below).
    const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
    const first = preferred ?? tabbables()[0] ?? container
    if (first === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1')
    }
    // Only steal focus if it isn't already inside the container.
    if (!container.contains(document.activeElement)) {
      first.focus()
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (!isTrapTab(e) || !container) return
      const items = tabbables()
      const current = items.indexOf(document.activeElement as HTMLElement)
      const next = nextTrapIndex(items.length, current, e.shiftKey)
      e.preventDefault()
      if (next === null) {
        container.focus()
      } else {
        items[next].focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      const toRestore = previouslyFocused.current
      if (toRestore && document.contains(toRestore)) {
        toRestore.focus()
      }
    }
  }, [active])

  return containerRef
}
