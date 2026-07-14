import { useDeckStore } from '../store/deckStore'
import { useDragSort } from '../hooks/useDragSort'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { GripIcon, PlusIcon } from './ui/icons'

/** Private drag type marking an internal card-reorder drag (see useDragSort). */
const CARD_DND_TYPE = 'application/x-cuedeck-card'

interface Props {
  /** Add a new step to the end of the running order (lifted to DeckWorkspace
   *  so it can also arm the "focus the new title" behavior, #35). */
  onAddCard: () => void
}

/**
 * The running-order navigator (#35 guided Build workspace): the left-pane
 * list of demo steps. Click to switch the active step, add new steps, and
 * drag rows (by the grip) to reorder the running order.
 *
 * Each row surfaces the step's position, title, a one-line preview of its
 * talking points (so the step's purpose is visible without opening it), and
 * its paste-ready content count — so the current step, its purpose, and how
 * much is ready to go are all obvious from the navigator alone.
 */
export function CardList({ onAddCard }: Props): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const setActiveCard = useDeckStore((s) => s.setActiveCard)
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
        <Button variant="ghost" size="sm" icon={<PlusIcon />} onClick={onAddCard}>
          Add step
        </Button>
      </div>
      <ul className="flex-1 overflow-auto px-2 pb-2">
        {deck.cards.map((card, i) => {
          const isActive = activeCardId === card.id
          const isDragging = dragIndex === i
          const isDropTarget = overIndex === i && dragIndex !== null && dragIndex !== i
          const dropAbove = isDropTarget && (dragIndex as number) > i
          const dropBelow = isDropTarget && (dragIndex as number) < i
          const purpose = card.notes.trim().split('\n')[0]
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
                aria-current={isActive ? 'true' : undefined}
                className={`mb-1 flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left text-sm transition ${
                  isActive ? 'bg-deck-accent text-white' : 'text-deck-text hover:bg-deck-card'
                }`}
              >
                <span className="flex w-full items-center gap-2">
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
                  <span className="truncate font-medium">{card.title || 'Untitled step'}</span>
                  {card.snippets.length > 0 && (
                    <span
                      className={`ml-auto shrink-0 rounded-full px-1.5 text-[10px] ${
                        isActive ? 'bg-white/20' : 'bg-deck-border text-deck-muted'
                      }`}
                      title={`${card.snippets.length} paste-ready item${card.snippets.length === 1 ? '' : 's'}`}
                    >
                      {card.snippets.length}
                    </span>
                  )}
                </span>
                {purpose && (
                  <span
                    className={`truncate pl-9 text-xs ${
                      isActive ? 'text-white/70' : 'text-deck-muted'
                    }`}
                  >
                    {purpose}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {deck.cards.length === 0 && (
          <EmptyState
            className="mx-1 mt-2 border-none"
            title="No steps yet"
            description="Steps are the demo beats you'll click through while presenting."
            action={
              <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={onAddCard}>
                Add first step
              </Button>
            }
          />
        )}
      </ul>
    </div>
  )
}
