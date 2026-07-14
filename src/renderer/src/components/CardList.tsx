import { useDeckStore } from '../store/deckStore'
import { useDragSort } from '../hooks/useDragSort'
import { GripIcon } from './ui/icons'

/** Private drag type marking an internal card-reorder drag (see useDragSort). */
const CARD_DND_TYPE = 'application/x-cuedeck-card'

/**
 * The left-pane running order. Click to switch active card, add new cards,
 * and drag rows (by the grip) to reorder the running order.
 */
export function CardList(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const setActiveCard = useDeckStore((s) => s.setActiveCard)
  const addCard = useDeckStore((s) => s.addCard)
  const reorderCards = useDeckStore((s) => s.reorderCards)

  const { dragIndex, overIndex, getSourceProps, getTargetProps } = useDragSort(
    CARD_DND_TYPE,
    reorderCards
  )

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
        {deck.cards.map((card, i) => {
          const isActive = activeCardId === card.id
          const isDragging = dragIndex === i
          const isDropTarget = overIndex === i && dragIndex !== null && dragIndex !== i
          const dropAbove = isDropTarget && (dragIndex as number) > i
          const dropBelow = isDropTarget && (dragIndex as number) < i
          return (
            <li
              key={card.id}
              {...getTargetProps(i)}
              className={`relative ${isDragging ? 'opacity-40' : ''}`}
            >
              {/* Insertion indicator */}
              {dropAbove && (
                <span className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded bg-deck-accent" />
              )}
              {dropBelow && (
                <span className="pointer-events-none absolute -bottom-0.5 left-2 right-2 h-0.5 rounded bg-deck-accent" />
              )}
              <button
                onClick={() => setActiveCard(card.id)}
                className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                  isActive ? 'bg-deck-accent text-white' : 'text-deck-text hover:bg-deck-card'
                }`}
              >
                <span
                  {...getSourceProps(i)}
                  onClick={(e) => e.stopPropagation()}
                  className={`cursor-grab select-none text-xs active:cursor-grabbing ${
                    isActive ? 'text-white/60' : 'text-deck-muted'
                  }`}
                  title="Drag to reorder"
                  aria-hidden="true"
                >
                  <GripIcon />
                </span>
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-deck-muted'}`}>
                  {i + 1}
                </span>
                <span className="truncate">{card.title || 'Untitled'}</span>
                {card.snippets.length > 0 && (
                  <span
                    className={`ml-auto rounded-full px-1.5 text-[10px] ${
                      isActive ? 'bg-white/20' : 'bg-deck-border text-deck-muted'
                    }`}
                  >
                    {card.snippets.length}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {deck.cards.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-deck-muted">
            No cards yet. Add your first beat.
          </p>
        )}
      </ul>
    </div>
  )
}
