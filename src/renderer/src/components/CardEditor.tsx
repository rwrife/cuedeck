import { useEffect, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { SnippetButton } from './SnippetButton'
import { MarkdownNotes } from './MarkdownNotes'
import { MarkdownHelp } from './MarkdownHelp'
import { VariablesPanel } from './VariablesPanel'
import { useDragSort } from '../hooks/useDragSort'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { TextField } from './ui/TextField'
import { TextArea } from './ui/TextArea'
import { EmptyState } from './ui/EmptyState'
import { SegmentedControl } from './ui/SegmentedControl'
import { PlusIcon, TrashIcon } from './ui/icons'

/** Private drag type marking an internal snippet-reorder drag (see useDragSort). */
const SNIPPET_DND_TYPE = 'application/x-cuedeck-snippet'

type NotesMode = 'write' | 'preview'

const NOTES_MODE_LABELS: Record<NotesMode, string> = { write: 'Write', preview: 'Preview' }

interface Props {
  /** Add a new step — used by this pane's own empty state so a user landing
   *  here with no step selected has the same one useful next action (#35). */
  onAddCard: () => void
}

/**
 * The step editor (#35 guided Build workspace): title, talking points, and
 * the list of paste-ready content for the active step (reorderable via each
 * item's grip). Markdown formatting help sits in its own contextual
 * disclosure next to the notes toggle; deck-level Variables render directly
 * in the Advanced area below, relying on VariablesPanel's own single
 * collapsed-by-default disclosure rather than a second wrapping toggle.
 */
export function CardEditor({ onAddCard }: Props): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const updateCard = useDeckStore((s) => s.updateCard)
  const removeCard = useDeckStore((s) => s.removeCard)
  const addSnippet = useDeckStore((s) => s.addSnippet)
  const reorderSnippets = useDeckStore((s) => s.reorderSnippets)
  const focusCardId = useDeckStore((s) => s.focusCardId)
  const clearFocusCard = useDeckStore((s) => s.clearFocusCard)
  const focusSnippetId = useDeckStore((s) => s.focusSnippetId)
  const clearFocusSnippet = useDeckStore((s) => s.clearFocusSnippet)

  const cardIndex = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = cardIndex >= 0 ? deck.cards[cardIndex] : undefined

  // Notes editor sub-mode: raw Markdown "Write" vs rendered "Preview" (#6).
  const [notesMode, setNotesMode] = useState<NotesMode>('write')
  // Id of the paste-ready item most recently created but not yet focused
  // (#35) — passed to its SnippetButton so it mounts expanded and focused.
  const [pendingFocusSnippetId, setPendingFocusSnippetId] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement | null>(null)

  const { dragIndex, overIndex, getSourceProps, getTargetProps } = useDragSort(
    SNIPPET_DND_TYPE,
    (from, to) => reorderSnippets(card!.id, from, to)
  )

  // Focus + select the title the instant a newly created step renders — a new
  // step must never sit unfocused waiting for a second click. Driven by the
  // store's one-shot focusCardId so a single mechanism covers both the guided
  // New Demo blank/starter-template flows (#34) and in-Build add-step (#35).
  useEffect(() => {
    if (card && focusCardId === card.id) {
      titleRef.current?.focus()
      titleRef.current?.select()
      clearFocusCard()
    }
  }, [card, focusCardId, clearFocusCard])

  // Consume a one-shot request to focus a specific piece of paste-ready content
  // (#38): set when a deleted snippet is restored via undo, so focus lands back
  // on the recovered item — a predictable focus target after a destructive
  // action. Routed through the same pendingFocus mechanism new content uses.
  useEffect(() => {
    if (focusSnippetId && card?.snippets.some((s) => s.id === focusSnippetId)) {
      setPendingFocusSnippetId(focusSnippetId)
      clearFocusSnippet()
    }
  }, [focusSnippetId, card, clearFocusSnippet])

  if (!card) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-md border-none"
        title={deck.cards.length === 0 ? 'No steps yet' : 'Select a step to begin'}
        description={
          deck.cards.length === 0
            ? "Steps are the demo beats you'll click through while presenting. Add your first one to start writing."
            : 'Choose a step from the running order on the left, or add a new one.'
        }
        action={
          <Button variant="primary" icon={<PlusIcon />} onClick={onAddCard}>
            {deck.cards.length === 0 ? 'Add first step' : 'Add step'}
          </Button>
        }
      />
    )
  }

  function handleAddSnippet(): void {
    const id = addSnippet(card!.id)
    setPendingFocusSnippetId(id)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      {/* Current position + title + delete: the step, its place in the running
          order, and the next action (delete) are all in one place (#35). */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-deck-muted">
          Step {cardIndex + 1} of {deck.cards.length}
        </span>
        <div className="flex items-center gap-3">
          <TextField
            ref={titleRef}
            value={card.title}
            onChange={(e) => updateCard(card.id, { title: e.target.value })}
            placeholder="Step title…"
            aria-label="Step title"
            className="flex-1 border-transparent bg-transparent px-0 text-2xl font-semibold focus-visible:border-b focus-visible:ring-0"
          />
          <IconButton
            label="Delete step"
            icon={<TrashIcon />}
            onClick={() => removeCard(card.id)}
            className="hover:!text-deck-danger"
          />
        </div>
      </div>

      {/* Talking points */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-deck-muted">
            Talking Points
          </label>
          <div className="flex items-center gap-3">
            <MarkdownHelp />
            <SegmentedControl
              value={notesMode}
              options={['write', 'preview']}
              labels={NOTES_MODE_LABELS}
              onChange={setNotesMode}
              ariaLabel="Talking points editor mode"
              size="sm"
            />
          </div>
        </div>
        {notesMode === 'preview' ? (
          card.notes.trim() ? (
            <MarkdownNotes
              source={card.notes}
              className="min-h-[9.5rem] rounded-lg border border-deck-border bg-deck-panel p-3 leading-relaxed"
            />
          ) : (
            <p className="min-h-[9.5rem] rounded-lg border border-dashed border-deck-border bg-deck-panel p-3 text-sm italic text-deck-muted">
              Nothing to preview yet. Write some notes in the Write tab.
            </p>
          )
        ) : (
          <TextArea
            value={card.notes}
            onChange={(e) => updateCard(card.id, { notes: e.target.value })}
            placeholder="What you'll say and do on this step…"
            rows={6}
            aria-label="Talking points"
          />
        )}
      </div>

      {/* Paste-ready content */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-deck-muted">
            Paste-Ready Content
          </label>
          <Button variant="ghost" size="sm" icon={<PlusIcon />} onClick={handleAddSnippet}>
            Add content
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {card.snippets.map((snippet, i) => {
            const isDropTarget = overIndex === i && dragIndex !== null && dragIndex !== i
            return (
              <SnippetButton
                key={snippet.id}
                cardId={card.id}
                snippet={snippet}
                index={i}
                sourceHandlers={getSourceProps(i)}
                targetHandlers={getTargetProps(i)}
                dragging={dragIndex === i}
                dropAbove={isDropTarget && (dragIndex as number) > i}
                dropBelow={isDropTarget && (dragIndex as number) < i}
                autoFocus={pendingFocusSnippetId === snippet.id}
                onAutoFocused={() => setPendingFocusSnippetId(null)}
              />
            )
          })}
          {card.snippets.length === 0 && (
            <EmptyState
              title="No paste-ready content yet"
              description="Add the text you'll paste into your demo app during this step."
              action={
                <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={handleAddSnippet}>
                  Add paste-ready content
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* Advanced: deck-level Variables — technical, infrequent configuration
          that applies to the whole deck, not just this step. VariablesPanel
          already owns its own collapsed-by-default disclosure (plus the
          "N referenced" warning nudge), so this area is a plain labeled
          section rather than a second toggle — variables need only one
          expansion, and the warning is never hidden behind two clicks (#35
          review). */}
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-deck-muted">
          Advanced
        </span>
        <p className="mb-2 text-xs text-deck-muted">
          Variables apply to the whole deck, not just this step.
        </p>
        <VariablesPanel />
      </div>
    </div>
  )
}
