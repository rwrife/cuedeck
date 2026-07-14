import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { positionLabel } from '@shared/presenter'
import { CardList } from './CardList'
import { MarkdownNotes } from './MarkdownNotes'
import { ReadOnlySnippet } from './ReadOnlySnippet'

/**
 * The Rehearse workspace (#33): practice the running order in full-window
 * chrome before going live.
 *
 * Unlike Present (compact + always-on-top), Rehearse stays in the normal
 * window with the running order visible on the left, so the user can move
 * through the deck, read the talking points, and try the copy hotkeys without
 * committing to the floating presenter window. Exiting Present lands here.
 */
export function RehearseWorkspace(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)

  // Demo hotkeys work here too: 1–9 copy, ←/→ change cards.
  useHotkeys()

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length
  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-deck-border bg-deck-panel">
        <CardList />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-deck-border bg-deck-panel px-4 py-2 text-sm text-deck-muted">
          <span>Rehearsal — practice before you present</span>
          <span className="font-mono tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </header>

        {card ? (
          <div
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6"
            style={{ fontSize: 'calc(1rem * var(--deck-font-scale, 1))' }}
          >
            <h1 className="text-2xl font-bold leading-tight">{card.title || 'Untitled card'}</h1>
            {card.notes.trim() ? (
              <MarkdownNotes
                source={card.notes}
                className="text-lg leading-relaxed text-deck-text"
              />
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
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-deck-muted">
            {total === 0 ? 'This deck has no cards yet.' : 'No card selected.'}
          </div>
        )}

        <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-4 py-2.5">
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
      </main>
    </div>
  )
}
