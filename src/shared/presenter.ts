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
 * The 1–9 copy-hotkey / number-badge label for the snippet at zero-based
 * `index`, or `null` when the snippet has no hotkey.
 *
 * Only the first nine paste actions get a keyboard shortcut (matching
 * {@link SNIPPET_HOTKEYS} in `@shared/hotkeys`); the tenth onward — and any
 * invalid index — return `null` so the Presenter can render a non-numbered
 * affordance instead of a misleading badge.
 */
export function snippetHotkeyLabel(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= 9) return null
  return String(index + 1)
}

/**
 * Fraction (0–1) of the way through the deck at the active step, for the
 * Presenter progress bar.
 *
 * `index` is the zero-based active-card index; the bar fills as the presenter
 * advances, reaching a full `1` on the last step. Returns `0` for an empty
 * deck (`total <= 0`) or an unresolved active card (`index < 0`), and clamps
 * an out-of-range index to a full bar so the indicator never overflows.
 */
export function presenterProgress(index: number, total: number): number {
  if (total <= 0 || index < 0) return 0
  const clamped = Math.min(index, total - 1)
  return (clamped + 1) / total
}

/** How much content a Presenter step carries, used to adapt its spacing. */
export type PresenterDensity = 'sparse' | 'balanced' | 'full'

/**
 * Classify a Presenter step's content density so the compact window can adapt
 * its layout: a `'sparse'` step is centered with generous spacing so it reads
 * as deliberate rather than broken/unfinished, a `'full'` step is top-aligned
 * and scrolls, and `'balanced'` sits between.
 *
 * The weight blends the rendered talking-point length with the number of paste
 * actions (each paste action is worth roughly a short paragraph of vertical
 * space). Negative inputs are floored to zero so a malformed step can't skew
 * the classification.
 */
export function presenterStepDensity(input: {
  notesLength: number
  snippetCount: number
}): PresenterDensity {
  const notes = Math.max(0, input.notesLength)
  const snippets = Math.max(0, input.snippetCount)
  const weight = notes + snippets * 120
  if (weight <= 200) return 'sparse'
  if (weight >= 800) return 'full'
  return 'balanced'
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
