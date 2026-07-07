import { useDeckStore } from '../store/deckStore'

/**
 * The left-pane running order. Click to switch active card, add new cards.
 * (Drag-to-reorder is handled in a dedicated issue.)
 */
export function CardList(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const setActiveCard = useDeckStore((s) => s.setActiveCard)
  const addCard = useDeckStore((s) => s.addCard)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-deck-muted">
          Running Order
        </span>
        <button
          onClick={addCard}
          className="rounded bg-deck-card px-2 py-0.5 text-sm text-deck-text transition hover:bg-deck-accent hover:text-white"
          title="Add card"
        >
          + Card
        </button>
      </div>
      <ul className="flex-1 overflow-auto px-2 pb-2">
        {deck.cards.map((card, i) => (
          <li key={card.id}>
            <button
              onClick={() => setActiveCard(card.id)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                activeCardId === card.id
                  ? 'bg-deck-accent text-white'
                  : 'text-deck-text hover:bg-deck-card'
              }`}
            >
              <span
                className={`text-xs ${
                  activeCardId === card.id ? 'text-white/70' : 'text-deck-muted'
                }`}
              >
                {i + 1}
              </span>
              <span className="truncate">{card.title || 'Untitled'}</span>
              {card.snippets.length > 0 && (
                <span
                  className={`ml-auto rounded-full px-1.5 text-[10px] ${
                    activeCardId === card.id ? 'bg-white/20' : 'bg-deck-border text-deck-muted'
                  }`}
                >
                  {card.snippets.length}
                </span>
              )}
            </button>
          </li>
        ))}
        {deck.cards.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-deck-muted">
            No cards yet. Add your first beat.
          </p>
        )}
      </ul>
    </div>
  )
}
