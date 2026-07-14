import { describe, it, expect, vi } from 'vitest'
import { cx } from '../src/renderer/src/lib/ui/classNames'
import { buttonClasses, toneClasses } from '../src/renderer/src/lib/ui/variants'
import { prefersReducedMotion } from '../src/renderer/src/lib/ui/reducedMotion'
import { FOCUSABLE_SELECTOR, getFocusableElements } from '../src/renderer/src/lib/ui/focusTrap'

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
