/**
 * Pure, DOM-free helpers for Presenter Mode (#5).
 *
 * Presenter Mode is a compact, always-on-top, read-only view for running a live
 * demo. The rendering lives in the renderer, and the window resize/always-on-top
 * side effects live in the main process, but the small pieces of decision logic
 * live here so they can be unit-tested without Electron or a DOM.
 */

/** The two UI modes the workspace can be in. */
export type DeckMode = 'edit' | 'present'

/** Flip between the two modes. */
export function toggleMode(mode: DeckMode): DeckMode {
  return mode === 'present' ? 'edit' : 'present'
}

/** True when the given mode is the read-only presenter layout. */
export function isPresenting(mode: DeckMode): boolean {
  return mode === 'present'
}

/**
 * Compact window size used while presenting. Deliberately small so it can float
 * over a demo target app without covering much of the screen.
 */
export const PRESENTER_WINDOW_SIZE = { width: 460, height: 640 } as const

/**
 * Build a human-friendly "position / total" indicator, e.g. `"3 / 12"`.
 *
 * `index` is zero-based (as stored on the active card lookup); the label shows
 * the one-based position. When the deck is empty or the active card can't be
 * located (`index < 0`), it renders `"0 / 0"` and `"– / <total>"` respectively
 * so the presenter never shows a misleading position.
 */
export function positionLabel(index: number, total: number): string {
  if (total <= 0) return '0 / 0'
  if (index < 0) return `– / ${total}`
  const clamped = Math.min(Math.max(index, 0), total - 1)
  return `${clamped + 1} / ${total}`
}

/**
 * Decide whether a keyboard event should toggle Presenter Mode.
 *
 * Two ergonomic triggers, matching the issue:
 *  - `F5` on its own (classic "start presentation").
 *  - `Ctrl`/`Cmd`+`P` (mnemonic: **P**resent), which we intercept so it doesn't
 *    fall through to the browser/OS print dialog.
 *
 * Accepts a minimal, DOM-free shape so it can be unit-tested. Any other key
 * (or `F5` with modifiers held) returns `false`.
 */
export function isPresenterToggleKey(e: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): boolean {
  // Ctrl/Cmd+P — require exactly one of ctrl/meta, and no alt/shift.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    if (e.key === 'p' || e.key === 'P') return true
  }

  // Bare F5 (no modifiers).
  if (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    return true
  }

  return false
}

/**
 * A single contextual shortcut hint surfaced in the Presenter footer.
 *
 * The presenter is a compact delivery surface driven mostly by the keyboard, so
 * we show the shortcuts inline rather than assuming the user has memorized them.
 * `keys` is the human-readable key label(s); `label` is what pressing them does.
 */
export interface PresenterShortcut {
  readonly keys: string
  readonly label: string
}

/**
 * Build the contextual shortcut hints for the current presenter state.
 *
 * The list adapts so we never advertise an action that can't be taken:
 *  - the copy hint only appears when the active card has at least one snippet,
 *    and reflects how many number keys are live (1, 1–2, … 1–9).
 *  - the previous/next hints only appear when there is somewhere to go.
 *  - exit is always available.
 *
 * Pure and DOM-free so it can be unit-tested and reused by the renderer.
 */
export function presenterShortcuts(opts: {
  snippetCount: number
  canGoPrev: boolean
  canGoNext: boolean
}): PresenterShortcut[] {
  const hints: PresenterShortcut[] = []

  const copyKeys = Math.min(Math.max(opts.snippetCount, 0), 9)
  if (copyKeys === 1) {
    hints.push({ keys: '1', label: 'Copy snippet' })
  } else if (copyKeys > 1) {
    hints.push({ keys: `1–${copyKeys}`, label: 'Copy snippet' })
  }

  if (opts.canGoPrev) hints.push({ keys: '←', label: 'Previous' })
  if (opts.canGoNext) hints.push({ keys: '→', label: 'Next' })

  hints.push({ keys: 'F5', label: 'Exit' })

  return hints
}
