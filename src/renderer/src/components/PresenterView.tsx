import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { positionLabel } from '@shared/presenter'
import { MarkdownNotes } from './MarkdownNotes'
import { ReadOnlySnippet } from './ReadOnlySnippet'

/**
 * Presenter Mode (#5): a compact, distraction-free, read-only view for running
 * a live demo.
 *
 * Shows the active card's title + talking-point notes (read-only, larger and
 * higher-contrast for readability from a distance), large numbered copy buttons
 * for its snippets, and prev/next controls with a "3 / 12" position indicator.
 * There are no editing controls here — no textareas, no delete buttons — so the
 * user can drive a demo without the authoring chrome getting in the way.
 *
 * The window-level side effects (compact size + always-on-top, restored on
 * exit) are handled by the store's `setMode` → `window.setPresenter` IPC; this
 * component only renders the layout and the read-only interactions.
 */
export function PresenterView(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const exitPresent = useDeckStore((s) => s.exitPresent)

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length

  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  // Track always-on-top so we can surface the state; the window is pinned on
  // entering presenter mode, but the user may have already had it pinned.
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  return (
    <div className="flex h-full flex-col bg-deck-bg text-deck-text">
      {/* Compact top bar: exit + position + on-top indicator */}
      <header className="flex items-center justify-between gap-2 border-b border-deck-border bg-deck-panel px-3 py-2">
        <button
          onClick={exitPresent}
          className="rounded px-2 py-1 text-sm font-medium text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title="Exit Presenter Mode to Rehearse (F5 or Ctrl/Cmd+P)"
        >
          ✕ Exit
        </button>
        <span className="flex items-center gap-2 text-xs text-deck-muted">
          {pinned && (
            <span title="Window is pinned on top" aria-label="Pinned on top">
              📌
            </span>
          )}
          <span className="font-mono text-sm tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </span>
      </header>

      {/* Card body */}
      {card ? (
        <div
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
          // Scale the presenter's talking-point typography by the font-size
          // preference (#8). Applied here (not on snippet buttons) so the demo
          // controls stay a consistent, tappable size.
          style={{ fontSize: 'calc(1rem * var(--deck-font-scale, 1))' }}
        >
          <h1 className="text-2xl font-bold leading-tight">{card.title || 'Untitled card'}</h1>

          {card.notes.trim() ? (
            <MarkdownNotes source={card.notes} className="text-lg leading-relaxed text-deck-text" />
          ) : (
            <p className="text-base italic text-deck-muted">No talking points for this card.</p>
          )}

          {card.snippets.length > 0 && (
            <div className="flex flex-col gap-2">
              {card.snippets.map((snippet, i) => (
                <ReadOnlySnippet key={snippet.id} cardId={card.id} snippet={snippet} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-deck-muted">
          {total === 0 ? 'This deck has no cards yet.' : 'No card selected.'}
        </div>
      )}

      {/* Prev / next controls */}
      <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-3 py-2.5">
        <button
          onClick={() => stepActiveCard(-1)}
          disabled={atStart}
          className="flex-1 rounded-lg border border-deck-border bg-deck-card py-2 text-lg font-semibold transition enabled:hover:border-deck-accent enabled:hover:bg-deck-panel disabled:cursor-not-allowed disabled:opacity-40"
          title="Previous card (←)"
          aria-label="Previous card"
        >
          ←
        </button>
        <button
          onClick={() => stepActiveCard(1)}
          disabled={atEnd}
          className="flex-1 rounded-lg border border-deck-border bg-deck-card py-2 text-lg font-semibold transition enabled:hover:border-deck-accent enabled:hover:bg-deck-panel disabled:cursor-not-allowed disabled:opacity-40"
          title="Next card (→)"
          aria-label="Next card"
        >
          →
        </button>
      </footer>
    </div>
  )
}
