import { describe, it, expect } from 'vitest'
import {
  PRESENTER_WINDOW_SIZE,
  isPresenterToggleKey,
  isPresenting,
  positionLabel,
  presenterShortcuts,
  toggleMode
} from '../src/shared/presenter'

describe('presenter: mode toggling', () => {
  it('flips between edit and present', () => {
    expect(toggleMode('edit')).toBe('present')
    expect(toggleMode('present')).toBe('edit')
  })

  it('reports whether a mode is the presenter layout', () => {
    expect(isPresenting('present')).toBe(true)
    expect(isPresenting('edit')).toBe(false)
  })
})

describe('presenter: compact window size', () => {
  it('is a small, positive footprint', () => {
    expect(PRESENTER_WINDOW_SIZE.width).toBeGreaterThan(0)
    expect(PRESENTER_WINDOW_SIZE.height).toBeGreaterThan(0)
    // Sanity: meaningfully smaller than the default 1100x760 editor window.
    expect(PRESENTER_WINDOW_SIZE.width).toBeLessThan(1100)
    expect(PRESENTER_WINDOW_SIZE.height).toBeLessThan(760)
  })
})

describe('presenter: position label', () => {
  it('renders a one-based "index / total"', () => {
    expect(positionLabel(0, 12)).toBe('1 / 12')
    expect(positionLabel(2, 12)).toBe('3 / 12')
    expect(positionLabel(11, 12)).toBe('12 / 12')
  })

  it('renders 0 / 0 for an empty deck', () => {
    expect(positionLabel(-1, 0)).toBe('0 / 0')
    expect(positionLabel(0, 0)).toBe('0 / 0')
  })

  it('shows a dash when the active card is not found but the deck has cards', () => {
    expect(positionLabel(-1, 5)).toBe('– / 5')
  })

  it('clamps an out-of-range index into the deck', () => {
    expect(positionLabel(99, 3)).toBe('3 / 3')
  })
})

describe('presenter: toggle hotkey', () => {
  it('matches bare F5', () => {
    expect(isPresenterToggleKey({ key: 'F5' })).toBe(true)
  })

  it('matches Ctrl+P and Cmd+P (either case)', () => {
    expect(isPresenterToggleKey({ key: 'p', ctrlKey: true })).toBe(true)
    expect(isPresenterToggleKey({ key: 'P', ctrlKey: true })).toBe(true)
    expect(isPresenterToggleKey({ key: 'p', metaKey: true })).toBe(true)
  })

  it('does not match F5 or P with the wrong modifiers', () => {
    // F5 must be bare.
    expect(isPresenterToggleKey({ key: 'F5', ctrlKey: true })).toBe(false)
    expect(isPresenterToggleKey({ key: 'F5', shiftKey: true })).toBe(false)
    // Plain P (no ctrl/cmd) is normal typing, not a toggle.
    expect(isPresenterToggleKey({ key: 'p' })).toBe(false)
    // Ctrl+Shift+P / Ctrl+Alt+P are other shortcuts, leave them alone.
    expect(isPresenterToggleKey({ key: 'p', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(isPresenterToggleKey({ key: 'p', ctrlKey: true, altKey: true })).toBe(false)
  })

  it('ignores unrelated keys', () => {
    for (const key of ['F4', 'F6', 'Enter', 'ArrowLeft', 'a', '1', '']) {
      expect(isPresenterToggleKey({ key })).toBe(false)
    }
  })
})

describe('presenter: contextual shortcut hints', () => {
  it('always offers Exit', () => {
    const hints = presenterShortcuts({ snippetCount: 0, canGoPrev: false, canGoNext: false })
    expect(hints).toEqual([{ keys: 'F5', label: 'Exit' }])
  })

  it('shows a single copy key for one snippet', () => {
    const hints = presenterShortcuts({ snippetCount: 1, canGoPrev: false, canGoNext: false })
    expect(hints[0]).toEqual({ keys: '1', label: 'Copy snippet' })
  })

  it('shows a copy range for multiple snippets, capped at 9', () => {
    expect(
      presenterShortcuts({ snippetCount: 4, canGoPrev: false, canGoNext: false })[0]
    ).toEqual({ keys: '1–4', label: 'Copy snippet' })
    // Only 1–9 have hotkeys, so a bigger deck still caps at 9.
    expect(
      presenterShortcuts({ snippetCount: 25, canGoPrev: false, canGoNext: false })[0]
    ).toEqual({ keys: '1–9', label: 'Copy snippet' })
  })

  it('only advertises navigation that is actually possible', () => {
    const keysOf = (opts: Parameters<typeof presenterShortcuts>[0]): string[] =>
      presenterShortcuts(opts).map((h) => h.keys)

    expect(keysOf({ snippetCount: 0, canGoPrev: true, canGoNext: true })).toEqual([
      '←',
      '→',
      'F5'
    ])
    expect(keysOf({ snippetCount: 0, canGoPrev: false, canGoNext: true })).toEqual(['→', 'F5'])
    expect(keysOf({ snippetCount: 0, canGoPrev: true, canGoNext: false })).toEqual(['←', 'F5'])
  })

  it('composes copy + navigation + exit in order for a rich step', () => {
    const hints = presenterShortcuts({ snippetCount: 3, canGoPrev: true, canGoNext: true })
    expect(hints).toEqual([
      { keys: '1–3', label: 'Copy snippet' },
      { keys: '←', label: 'Previous' },
      { keys: '→', label: 'Next' },
      { keys: 'F5', label: 'Exit' }
    ])
  })
})
