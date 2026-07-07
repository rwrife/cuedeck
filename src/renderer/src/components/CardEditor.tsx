import { useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { SnippetButton } from './SnippetButton'
import { MarkdownNotes } from './MarkdownNotes'
import { VariablesPanel } from './VariablesPanel'
import { useDragSort } from '../hooks/useDragSort'

/** Private drag type marking an internal snippet-reorder drag (see useDragSort). */
const SNIPPET_DND_TYPE = 'application/x-cuedeck-snippet'

/**
 * Right-pane editor for the active card: title, talking-point notes,
 * and the list of copy/drag snippets (reorderable via each snippet's grip).
 */
export function CardEditor(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const updateCard = useDeckStore((s) => s.updateCard)
  const removeCard = useDeckStore((s) => s.removeCard)
  const addSnippet = useDeckStore((s) => s.addSnippet)
  const reorderSnippets = useDeckStore((s) => s.reorderSnippets)

  const card = deck.cards.find((c) => c.id === activeCardId)

  // Notes editor sub-mode: raw Markdown "Write" vs rendered "Preview" (#6).
  const [notesPreview, setNotesPreview] = useState(false)

  const { dragIndex, overIndex, getSourceProps, getTargetProps } = useDragSort(
    SNIPPET_DND_TYPE,
    (from, to) => reorderSnippets(card!.id, from, to)
  )

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center text-deck-muted">
        Select or add a card to begin.
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      {/* Title + delete */}
      <div className="flex items-center gap-3">
        <input
          value={card.title}
          onChange={(e) => updateCard(card.id, { title: e.target.value })}
          placeholder="Card title…"
          className="flex-1 border-b border-transparent bg-transparent text-2xl font-semibold outline-none focus:border-deck-border"
        />
        <button
          onClick={() => removeCard(card.id)}
          className="rounded px-2 py-1 text-sm text-deck-muted transition hover:text-red-400"
          title="Delete card"
        >
          Delete
        </button>
      </div>

      {/* Notes */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wide text-deck-muted">
            Talking Points
          </label>
          {/* Write / Preview toggle for the Markdown notes. */}
          <div
            className="flex overflow-hidden rounded border border-deck-border text-xs"
            role="tablist"
            aria-label="Notes editor mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!notesPreview}
              onClick={() => setNotesPreview(false)}
              className={`px-2 py-0.5 transition ${
                notesPreview
                  ? 'text-deck-muted hover:text-deck-text'
                  : 'bg-deck-accent text-white'
              }`}
            >
              Write
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notesPreview}
              onClick={() => setNotesPreview(true)}
              className={`px-2 py-0.5 transition ${
                notesPreview
                  ? 'bg-deck-accent text-white'
                  : 'text-deck-muted hover:text-deck-text'
              }`}
              title="Preview rendered Markdown"
            >
              Preview
            </button>
          </div>
        </div>
        {notesPreview ? (
          card.notes.trim() ? (
            <MarkdownNotes
              source={card.notes}
              className="min-h-[9.5rem] rounded-lg border border-deck-border bg-deck-panel p-3 leading-relaxed"
            />
          ) : (
            <p className="min-h-[9.5rem] rounded-lg border border-dashed border-deck-border bg-deck-panel p-3 text-sm italic text-deck-muted">
              Nothing to preview yet. Write some Markdown in the Write tab.
            </p>
          )
        ) : (
          <textarea
            value={card.notes}
            onChange={(e) => updateCard(card.id, { notes: e.target.value })}
            placeholder="What you'll say and do on this beat… (Markdown: **bold**, - lists, - [ ] tasks, `code`)"
            rows={6}
            className="w-full resize-y rounded-lg border border-deck-border bg-deck-panel p-3 leading-relaxed outline-none placeholder:text-deck-muted focus:border-deck-accent"
          />
        )}
      </div>

      {/* Deck-level variables ({{placeholder}} substitution, #7). Scoped to the
          whole deck, shown here in the editor so authors define values next to
          the snippets that use them. */}
      <VariablesPanel />

      {/* Snippets */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-deck-muted">
            Snippets
          </label>
          <button
            onClick={() => addSnippet(card.id)}
            className="rounded bg-deck-card px-2 py-0.5 text-sm transition hover:bg-deck-accent hover:text-white"
          >
            + Snippet
          </button>
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
              />
            )
          })}
          {card.snippets.length === 0 && (
            <p className="rounded-lg border border-dashed border-deck-border p-6 text-center text-sm text-deck-muted">
              No snippets. Add the text blobs you paste during this step.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
