import { describe, it, expect } from 'vitest'
import {
  PRESENTER_WINDOW_SIZE,
  isPresenterToggleKey,
  isPresenting,
  positionLabel,
  presenterProgress,
  presenterStepDensity,
  snippetHotkeyLabel,
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

describe('presenter: snippet hotkey label', () => {
  it('labels the first nine snippets 1–9', () => {
    expect(snippetHotkeyLabel(0)).toBe('1')
    expect(snippetHotkeyLabel(4)).toBe('5')
    expect(snippetHotkeyLabel(8)).toBe('9')
  })

  it('returns null for the tenth snippet onward (no copy hotkey)', () => {
    expect(snippetHotkeyLabel(9)).toBeNull()
    expect(snippetHotkeyLabel(20)).toBeNull()
  })

  it('returns null for invalid indices', () => {
    expect(snippetHotkeyLabel(-1)).toBeNull()
    expect(snippetHotkeyLabel(1.5)).toBeNull()
  })
})

describe('presenter: progress fraction', () => {
  it('advances from the first step to a full bar on the last', () => {
    expect(presenterProgress(0, 4)).toBeCloseTo(0.25)
    expect(presenterProgress(1, 4)).toBeCloseTo(0.5)
    expect(presenterProgress(3, 4)).toBe(1)
  })

  it('is zero for an empty deck or an unresolved active card', () => {
    expect(presenterProgress(0, 0)).toBe(0)
    expect(presenterProgress(-1, 5)).toBe(0)
  })

  it('clamps an out-of-range index to a full bar', () => {
    expect(presenterProgress(99, 3)).toBe(1)
  })
})

describe('presenter: step density', () => {
  it('treats an all-but-empty step as sparse', () => {
    expect(presenterStepDensity({ notesLength: 0, snippetCount: 0 })).toBe('sparse')
    expect(presenterStepDensity({ notesLength: 40, snippetCount: 1 })).toBe('sparse')
  })

  it('treats a moderate step as balanced', () => {
    expect(presenterStepDensity({ notesLength: 200, snippetCount: 2 })).toBe('balanced')
  })

  it('treats a content-heavy step as full', () => {
    expect(presenterStepDensity({ notesLength: 900, snippetCount: 3 })).toBe('full')
    expect(presenterStepDensity({ notesLength: 0, snippetCount: 8 })).toBe('full')
  })

  it('guards against negative inputs', () => {
    expect(presenterStepDensity({ notesLength: -100, snippetCount: -5 })).toBe('sparse')
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
