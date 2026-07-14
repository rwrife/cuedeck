import { useEffect, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { SnippetButton } from './SnippetButton'
import { MarkdownNotes } from './MarkdownNotes'
import { VariablesPanel } from './VariablesPanel'
import { useDragSort } from '../hooks/useDragSort'
import { BUILD_LANGUAGE, stepTitleFieldId } from '@shared/buildLanguage'

/** Private drag type marking an internal snippet-reorder drag (see useDragSort). */
const SNIPPET_DND_TYPE = 'application/x-cuedeck-snippet'

/**
 * Right-pane editor for the active step (#35): title, talking-point notes, and
 * the paste-ready content blocks. Presenter-friendly language throughout; cue
 * cards are "Steps" and snippets are "Paste-ready content". Advanced tools
 * (variables, Markdown help) live behind a contextual disclosure so they don't
 * compete with the primary authoring workflow. Newly created steps focus their
 * title immediately (driven by the store's focusRequest).
 */
export function CardEditor(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const updateCard = useDeckStore((s) => s.updateCard)
  const removeCard = useDeckStore((s) => s.removeCard)
  const addSnippet = useDeckStore((s) => s.addSnippet)
  const reorderSnippets = useDeckStore((s) => s.reorderSnippets)
  const focusRequest = useDeckStore((s) => s.focusRequest)
  const clearFocusRequest = useDeckStore((s) => s.clearFocusRequest)

  const card = deck.cards.find((c) => c.id === activeCardId)

  // Notes editor sub-mode: raw Markdown "Write" vs rendered "Preview" (#6).
  const [notesPreview, setNotesPreview] = useState(false)
  // Contextual advanced-tools disclosure (#35): variables + Markdown help.
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const titleRef = useRef<HTMLInputElement | null>(null)

  // Autofocus a newly created step's title so it is immediately ready for
  // typing (#35 acceptance criteria). Consume the one-shot request afterwards.
  useEffect(() => {
    if (focusRequest?.kind === 'step-title' && card && focusRequest.id === card.id) {
      titleRef.current?.focus()
      titleRef.current?.select()
      clearFocusRequest()
    }
  }, [focusRequest, card, clearFocusRequest])

  const { dragIndex, overIndex, getSourceProps, getTargetProps } = useDragSort(
    SNIPPET_DND_TYPE,
    (from, to) => reorderSnippets(card!.id, from, to)
  )

  if (!card) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-deck-text">{BUILD_LANGUAGE.step.emptyTitle}</p>
        <p className="max-w-sm text-xs text-deck-muted">{BUILD_LANGUAGE.step.emptyBody}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      {/* Title + delete */}
      <div className="flex items-center gap-3">
        <input
          id={stepTitleFieldId(card.id)}
          ref={titleRef}
          value={card.title}
          onChange={(e) => updateCard(card.id, { title: e.target.value })}
          placeholder={BUILD_LANGUAGE.step.titlePlaceholder}
          aria-label="Step title"
          className="flex-1 border-b border-transparent bg-transparent text-2xl font-semibold outline-none focus:border-deck-border"
        />
        <button
          onClick={() => removeCard(card.id)}
          className="rounded px-2 py-1 text-sm text-deck-muted transition hover:text-red-400"
          title={BUILD_LANGUAGE.step.remove}
        >
          Delete
        </button>
      </div>

      {/* Notes */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wide text-deck-muted">
            {BUILD_LANGUAGE.notes.heading}
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
            placeholder={`${BUILD_LANGUAGE.notes.placeholder} (Markdown: **bold**, - lists, - [ ] tasks, \`code\`)`}
            rows={6}
            className="w-full resize-y rounded-lg border border-deck-border bg-deck-panel p-3 leading-relaxed outline-none placeholder:text-deck-muted focus:border-deck-accent"
          />
        )}
      </div>

      {/* Paste-ready content (snippets). This is the primary content the author
          copies/drags live, so it stays in the main workflow. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-deck-muted">
            {BUILD_LANGUAGE.content.listHeading}
          </label>
          <button
            onClick={() => addSnippet(card.id)}
            className="rounded bg-deck-card px-2 py-0.5 text-sm transition hover:bg-deck-accent hover:text-white"
            title="Add a block of text you paste live"
          >
            + {BUILD_LANGUAGE.content.add}
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
            <div className="rounded-lg border border-dashed border-deck-border p-6 text-center">
              <p className="text-sm font-medium text-deck-text">
                {BUILD_LANGUAGE.content.emptyTitle}
              </p>
              <p className="mt-1 text-xs text-deck-muted">{BUILD_LANGUAGE.content.emptyBody}</p>
              <button
                onClick={() => addSnippet(card.id)}
                className="mt-3 rounded-lg bg-deck-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {BUILD_LANGUAGE.content.emptyAction}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Advanced tools (#35): variables + Markdown help kept behind a
          contextual disclosure so they don't compete with the primary
          authoring flow, but remain one click away. */}
      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="rounded-lg border border-deck-border bg-deck-panel"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-deck-muted">
          {BUILD_LANGUAGE.advanced.heading}
          <span className="ml-2 font-normal normal-case tracking-normal text-deck-muted">
            — {BUILD_LANGUAGE.advanced.hint}
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-deck-border p-3">
          {/* Deck-level variables ({{placeholder}} substitution, #7). */}
          <VariablesPanel />
          <p className="text-xs leading-relaxed text-deck-muted">
            <span className="font-semibold text-deck-text">Markdown help:</span> Talking points
            support <code className="font-mono">**bold**</code>,{' '}
            <code className="font-mono">- lists</code>,{' '}
            <code className="font-mono">- [ ] tasks</code>, and{' '}
            <code className="font-mono">`code`</code>. Use{' '}
            <code className="font-mono">{'{{variable}}'}</code> in content to insert values defined
            above.
          </p>
        </div>
      </details>
    </div>
  )
}
