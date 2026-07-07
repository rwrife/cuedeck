/**
 * Pure hotkey mapping helpers, shared so they can be unit-tested without a DOM.
 *
 * The renderer's `useHotkeys` hook uses these to decide what a keypress means;
 * keeping the logic here (and DOM-free) lets the tests run in the node vitest env.
 */

/** The digit keys we support for snippet copy, in order. */
export const SNIPPET_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export type SnippetHotkey = (typeof SNIPPET_HOTKEYS)[number]

/**
 * Map a pressed number key (`"1"`..`"9"`) to a zero-based snippet index.
 *
 * Returns `null` when the key is not a supported snippet hotkey. Note this does
 * NOT bound-check against a specific card's snippet count — use
 * {@link snippetForKey} when you have the actual snippet list.
 */
export function snippetIndexForKey(key: string): number | null {
  const idx = SNIPPET_HOTKEYS.indexOf(key as SnippetHotkey)
  return idx === -1 ? null : idx
}

/**
 * Resolve which snippet a number key targets within a given ordered list.
 *
 * `"1"` maps to the first snippet (index 0), matching the visible `1..9` badges.
 * Returns `null` if the key isn't a snippet hotkey or there is no snippet at
 * that position (e.g. pressing `5` on a card with only 3 snippets).
 */
export function snippetForKey<T>(key: string, snippets: readonly T[]): T | null {
  const idx = snippetIndexForKey(key)
  if (idx === null || idx >= snippets.length) return null
  return snippets[idx]
}

/** Direction produced by the arrow keys for moving through the running order. */
export type CardStep = -1 | 1

/**
 * Map `ArrowLeft`/`ArrowRight` to a running-order step (`-1` = previous,
 * `+1` = next). Returns `null` for any other key.
 */
export function cardStepForKey(key: string): CardStep | null {
  if (key === 'ArrowLeft') return -1
  if (key === 'ArrowRight') return 1
  return null
}

/**
 * Given the id of the currently active card and the ordered card list, return
 * the id of the card `step` positions away, clamped to the ends of the list.
 *
 * Returns `null` when there are no cards. If the active id isn't found, the
 * step is applied from the first card so navigation still works.
 */
export function nextCardId(
  activeId: string | null,
  cards: readonly { id: string }[],
  step: CardStep
): string | null {
  if (cards.length === 0) return null
  const current = cards.findIndex((c) => c.id === activeId)
  const base = current === -1 ? 0 : current
  const target = Math.min(cards.length - 1, Math.max(0, base + step))
  return cards[target].id
}

/**
 * Decide whether keypresses should be ignored because the user is typing.
 *
 * Accepts a minimal, DOM-free shape so it can be unit-tested: pass the event
 * target's `tagName`, whether it's `isContentEditable`, and (optionally) its
 * `type` for `<input>` elements. Text-entry inputs and textareas swallow the
 * hotkeys; non-text inputs (checkbox, button, etc.) do not.
 */
export function isTypingTarget(target: {
  tagName?: string | null
  isContentEditable?: boolean
  type?: string | null
} | null): boolean {
  if (!target) return false
  if (target.isContentEditable) return true

  const tag = (target.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true

  if (tag === 'INPUT') {
    // Buttons/checkboxes/radios etc. aren't text entry; everything else is.
    const type = (target.type ?? 'text').toLowerCase()
    const nonText = new Set([
      'button',
      'checkbox',
      'radio',
      'range',
      'color',
      'file',
      'image',
      'reset',
      'submit'
    ])
    return !nonText.has(type)
  }

  return false
}
