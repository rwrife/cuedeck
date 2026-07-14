import { describe, it, expect } from 'vitest'
import { TABBABLE_SELECTOR, isTrapTab, nextTrapIndex } from '../src/shared/focusTrap'

describe('focusTrap: nextTrapIndex', () => {
  it('returns null when there are no tabbable elements', () => {
    expect(nextTrapIndex(0, -1, false)).toBeNull()
    expect(nextTrapIndex(0, 0, true)).toBeNull()
    expect(nextTrapIndex(-3, 2, false)).toBeNull()
  })

  it('always returns the sole element when there is exactly one', () => {
    expect(nextTrapIndex(1, -1, false)).toBe(0)
    expect(nextTrapIndex(1, 0, false)).toBe(0)
    expect(nextTrapIndex(1, 0, true)).toBe(0)
  })

  it('steps forward through the list', () => {
    expect(nextTrapIndex(3, 0, false)).toBe(1)
    expect(nextTrapIndex(3, 1, false)).toBe(2)
  })

  it('steps backward through the list', () => {
    expect(nextTrapIndex(3, 2, true)).toBe(1)
    expect(nextTrapIndex(3, 1, true)).toBe(0)
  })

  it('wraps forward off the last element back to the first (trap)', () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0)
  })

  it('wraps backward off the first element to the last (trap)', () => {
    expect(nextTrapIndex(3, 0, true)).toBe(2)
  })

  it('enters at the first element when focus is currently outside (forward)', () => {
    expect(nextTrapIndex(4, -1, false)).toBe(0)
  })

  it('enters at the last element when focus is currently outside (backward)', () => {
    expect(nextTrapIndex(4, -1, true)).toBe(3)
  })

  it('treats an out-of-range index like being outside the trap', () => {
    expect(nextTrapIndex(3, 9, false)).toBe(0)
    expect(nextTrapIndex(3, 9, true)).toBe(2)
  })
})

describe('focusTrap: isTrapTab', () => {
  it('accepts a bare Tab and Shift+Tab', () => {
    expect(isTrapTab({ key: 'Tab' })).toBe(true)
    expect(isTrapTab({ key: 'Tab', altKey: false })).toBe(true)
  })

  it('ignores non-Tab keys', () => {
    for (const key of ['Enter', 'Escape', 'a', 'ArrowDown', ' ']) {
      expect(isTrapTab({ key })).toBe(false)
    }
  })

  it('ignores Tab combined with a modifier so app/OS shortcuts still work', () => {
    expect(isTrapTab({ key: 'Tab', ctrlKey: true })).toBe(false)
    expect(isTrapTab({ key: 'Tab', metaKey: true })).toBe(false)
    expect(isTrapTab({ key: 'Tab', altKey: true })).toBe(false)
  })
})

describe('focusTrap: TABBABLE_SELECTOR', () => {
  it('targets the interactive elements and excludes tabindex="-1"', () => {
    expect(TABBABLE_SELECTOR).toContain('button:not([disabled])')
    expect(TABBABLE_SELECTOR).toContain('input:not([disabled])')
    expect(TABBABLE_SELECTOR).toContain('a[href]')
    expect(TABBABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
