import { describe, it, expect, vi } from 'vitest'
import { cx } from '../src/renderer/src/lib/ui/classNames'
import {
  buttonClasses,
  resolveAriaDisabled,
  resolveAriaPressed,
  toneClasses
} from '../src/renderer/src/lib/ui/variants'
import { prefersReducedMotion } from '../src/renderer/src/lib/ui/reducedMotion'
import { FOCUSABLE_SELECTOR, getFocusableElements } from '../src/renderer/src/lib/ui/focusTrap'
import {
  getNextSegmentIndex,
  isSegmentedNavKey
} from '../src/renderer/src/lib/ui/segmentedControlNav'
import { getNextMenuIndex, isMenuNavKey } from '../src/renderer/src/lib/ui/menuNav'

describe('ui: cx (className merge)', () => {
  it('joins truthy class names with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values (false, null, undefined, empty string)', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, null, undefined, '')).toBe('')
  })
})

describe('ui: buttonClasses', () => {
  it('always includes a focus-visible ring so keyboard focus is never invisible', () => {
    expect(buttonClasses()).toContain('focus-visible:ring-2')
  })

  it('always includes CSS disabled-state classes, keyed off the real `disabled` attribute', () => {
    // Tailwind's `disabled:` variant reacts to the element's actual `disabled`
    // HTML attribute, so these classes are static (no JS branching needed) —
    // every button gets a real dimmed/not-allowed state for free.
    const classes = buttonClasses()
    expect(classes).toContain('disabled:opacity-50')
    expect(classes).toContain('disabled:cursor-not-allowed')
  })

  it('gives the primary variant a solid accent fill distinct from secondary', () => {
    const primary = buttonClasses({ variant: 'primary' })
    const secondary = buttonClasses({ variant: 'secondary' })
    expect(primary).toContain('bg-deck-accent')
    expect(secondary).not.toContain('bg-deck-accent')
  })

  it('gives the danger variant the danger token', () => {
    expect(buttonClasses({ variant: 'danger' })).toContain('bg-deck-danger')
  })

  it('renders a distinct pressed/active fill regardless of variant', () => {
    const active = buttonClasses({ variant: 'ghost', active: true })
    expect(active).toContain('bg-deck-accent')
  })

  it('supports a success active tone (e.g. a live/recording indicator)', () => {
    const active = buttonClasses({ variant: 'ghost', active: true, activeTone: 'success' })
    expect(active).toContain('bg-deck-success')
  })

  it('scales size via a compact "sm" and default "md"', () => {
    expect(buttonClasses({ size: 'sm' })).toContain('text-xs')
    expect(buttonClasses({ size: 'md' })).toContain('text-sm')
  })
})

describe('ui: toneClasses (semantic status tone)', () => {
  it('returns a distinct class string per tone', () => {
    const tones = ['neutral', 'success', 'warning', 'danger', 'info'] as const
    const results = tones.map((t) => toneClasses(t))
    expect(new Set(results).size).toBe(tones.length)
  })

  it('maps success/warning/danger to their matching token colors', () => {
    expect(toneClasses('success')).toContain('deck-success')
    expect(toneClasses('warning')).toContain('deck-warning')
    expect(toneClasses('danger')).toContain('deck-danger')
  })
})

describe('ui: prefersReducedMotion', () => {
  it('returns the matches value of an injected media query (testable without a DOM)', () => {
    expect(prefersReducedMotion({ matches: true })).toBe(true)
    expect(prefersReducedMotion({ matches: false })).toBe(false)
  })

  it('defaults to false when no query is available (e.g. no window)', () => {
    expect(prefersReducedMotion(null)).toBe(false)
  })
})

describe('ui: focus trap helpers', () => {
  it('queries using a selector that includes interactive elements and excludes -1 tabindex', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })

  it('returns the focusable elements found within the given container', () => {
    const fakeButton = {} as HTMLElement
    const querySelectorAll = vi.fn().mockReturnValue([fakeButton])
    const result = getFocusableElements({ querySelectorAll })

    expect(querySelectorAll).toHaveBeenCalledWith(FOCUSABLE_SELECTOR)
    expect(result).toEqual([fakeButton])
  })

  it('returns an empty array for a null/undefined container', () => {
    expect(getFocusableElements(null)).toEqual([])
    expect(getFocusableElements(undefined)).toEqual([])
  })
})

describe('ui: resolveAriaPressed (Button toggle semantics)', () => {
  it('omits aria-pressed entirely when neither `active` nor an explicit value is supplied', () => {
    expect(resolveAriaPressed(undefined, undefined)).toBeUndefined()
  })

  it('exposes the toggle state via aria-pressed when `active` is explicitly supplied', () => {
    expect(resolveAriaPressed(true, undefined)).toBe(true)
    expect(resolveAriaPressed(false, undefined)).toBe(false)
  })

  it('preserves an explicitly provided aria-pressed over the derived `active` value', () => {
    expect(resolveAriaPressed(true, 'mixed')).toBe('mixed')
    expect(resolveAriaPressed(undefined, false)).toBe(false)
  })
})

describe('ui: resolveAriaDisabled (focusable-while-unavailable controls)', () => {
  it('returns true when the control is unavailable, so it stays focusable and describable', () => {
    // Deliberately NOT the native `disabled` attribute: a real `disabled`
    // control is removed from the tab order, so keyboard users could never
    // discover it or read its explanatory tooltip/description.
    expect(resolveAriaDisabled(false)).toBe(true)
  })

  it('returns undefined when the control is available (no attribute emitted)', () => {
    expect(resolveAriaDisabled(true)).toBeUndefined()
  })
})

describe('ui: segmented control keyboard navigation helpers', () => {
  it('recognizes the roving-tabindex navigation keys', () => {
    expect(isSegmentedNavKey('ArrowLeft')).toBe(true)
    expect(isSegmentedNavKey('ArrowRight')).toBe(true)
    expect(isSegmentedNavKey('ArrowUp')).toBe(true)
    expect(isSegmentedNavKey('ArrowDown')).toBe(true)
    expect(isSegmentedNavKey('Home')).toBe(true)
    expect(isSegmentedNavKey('End')).toBe(true)
    expect(isSegmentedNavKey('Enter')).toBe(false)
    expect(isSegmentedNavKey('a')).toBe(false)
  })

  it('moves right/down to the next index and wraps at the end', () => {
    expect(getNextSegmentIndex('ArrowRight', 0, 3)).toBe(1)
    expect(getNextSegmentIndex('ArrowDown', 2, 3)).toBe(0)
  })

  it('moves left/up to the previous index and wraps at the start', () => {
    expect(getNextSegmentIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(getNextSegmentIndex('ArrowUp', 2, 3)).toBe(1)
  })

  it('Home/End jump to the first/last option', () => {
    expect(getNextSegmentIndex('Home', 2, 3)).toBe(0)
    expect(getNextSegmentIndex('End', 0, 3)).toBe(2)
  })

  it('skips disabled options when moving and when jumping to Home/End', () => {
    const isDisabled = (i: number): boolean => i === 1
    expect(getNextSegmentIndex('ArrowRight', 0, 3, isDisabled)).toBe(2)
    expect(getNextSegmentIndex('Home', 2, 3, isDisabled)).toBe(0)

    const firstDisabled = (i: number): boolean => i === 0
    expect(getNextSegmentIndex('Home', 2, 3, firstDisabled)).toBe(1)
  })

  it('returns null when every option is disabled', () => {
    expect(getNextSegmentIndex('ArrowRight', 0, 3, () => true)).toBeNull()
  })
})

describe('ui: menu keyboard navigation helpers (#34 Library overflow menu)', () => {
  it('recognizes the menu navigation keys', () => {
    expect(isMenuNavKey('ArrowDown')).toBe(true)
    expect(isMenuNavKey('ArrowUp')).toBe(true)
    expect(isMenuNavKey('Enter')).toBe(false)
    expect(isMenuNavKey('Escape')).toBe(false)
  })

  it('moves down to the next index and wraps at the end', () => {
    expect(getNextMenuIndex('ArrowDown', 0, 3)).toBe(1)
    expect(getNextMenuIndex('ArrowDown', 2, 3)).toBe(0)
  })

  it('moves up to the previous index and wraps at the start', () => {
    expect(getNextMenuIndex('ArrowUp', 0, 3)).toBe(2)
    expect(getNextMenuIndex('ArrowUp', 2, 3)).toBe(1)
  })

  it('returns null for an empty menu', () => {
    expect(getNextMenuIndex('ArrowDown', -1, 0)).toBeNull()
  })
})
