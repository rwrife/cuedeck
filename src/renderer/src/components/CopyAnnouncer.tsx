import { useDeckStore } from '../store/deckStore'

/**
 * Screen-reader announcer for clipboard copies (#39 accessibility pass).
 *
 * Copy actions already give sighted users a visible "Copied ✓" flash, but on
 * the authoring/rehearsal surfaces that confirmation is a silent visual change
 * — a keyboard/screen-reader user who copies a piece of paste-ready content
 * gets no spoken confirmation. This mounts one shared visually-hidden
 * `aria-live` region driven by the store's `lastCopiedSnippetId` (the same
 * signal that drives the visible flash), so every copy — from a button, the
 * 1–9 hotkeys, the command palette, or live control — announces "Copied
 * {label}" exactly once, without stealing focus. It renders nothing visible.
 *
 * It intentionally shares the visible flash's signal, so honoring the "copy
 * flash" preference also silences the announcement when a user has opted out
 * of copy feedback entirely.
 */
export function CopyAnnouncer(): JSX.Element {
  const label = useDeckStore((s) => {
    const id = s.lastCopiedSnippetId
    if (!id || !s.deck) return null
    for (const card of s.deck.cards) {
      const snippet = card.snippets.find((sn) => sn.id === id)
      if (snippet) return snippet.label.trim() || 'Untitled paste-ready content'
    }
    return null
  })

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {label ? `Copied ${label}` : ''}
    </div>
  )
}
