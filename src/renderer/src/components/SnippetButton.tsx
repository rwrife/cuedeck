import { useEffect, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import { classifyVariables, renderSnippet } from '@shared/variables'
import { BUILD_LANGUAGE, contentLabelFieldId } from '@shared/buildLanguage'
import type { DragSourceHandlers, DropTargetHandlers } from '../hooks/useDragSort'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'

interface Props {
  cardId: string
  snippet: Snippet
  index: number
  /** Drag-source handlers for the reorder grip (from useDragSort). */
  sourceHandlers: DragSourceHandlers
  /** Drop-target handlers for the row body (from useDragSort). */
  targetHandlers: DropTargetHandlers
  /** Row is the current drop target; render an insertion indicator. */
  dropAbove: boolean
  dropBelow: boolean
  /** Row is the one being dragged; dim it. */
  dragging: boolean
}

/**
 * The core interaction unit. Each snippet is:
 *  - editable (label + content)
 *  - one-click copy to clipboard (with a "Copied ✓" flash)
 *  - draggable OUT: drag the numbered handle straight into another app's field
 *  - reorderable: drag the dedicated grip (⠿) to sort within the card
 *
 * The two drags are deliberately separate affordances with separate data:
 * the numbered handle emits `text/plain` (external paste target), while the
 * reorder grip uses a private MIME type via `sortHandlers`. This keeps
 * drag-out into other apps working while enabling internal sorting.
 */
export function SnippetButton({
  cardId,
  snippet,
  index,
  sourceHandlers,
  targetHandlers,
  dropAbove,
  dropBelow,
  dragging
}: Props): JSX.Element {
  const updateSnippet = useDeckStore((s) => s.updateSnippet)
  const removeSnippet = useDeckStore((s) => s.removeSnippet)
  const copySnippet = useDeckStore((s) => s.copySnippet)
  const clearLastCopied = useDeckStore((s) => s.clearLastCopied)
  // Deck-level variables drive both drag-out substitution and the “uses…” hint.
  const variables = useDeckStore((s) => s.deck?.variables)
  // Flash "Copied ✓" whenever this snippet is the last-copied one — whether the
  // copy came from this button or from a number-key hotkey.
  const copied = useDeckStore((s) => s.lastCopiedSnippetId === snippet.id)
  const focusRequest = useDeckStore((s) => s.focusRequest)
  const clearFocusRequest = useDeckStore((s) => s.clearFocusRequest)
  const [expanded, setExpanded] = useState(false)
  const labelRef = useRef<HTMLInputElement | null>(null)

  // Autofocus a newly added block's label so it is immediately ready for
  // typing (#35 acceptance criteria). Consume the one-shot request afterwards.
  useEffect(() => {
    if (focusRequest?.kind === 'content-label' && focusRequest.id === snippet.id) {
      labelRef.current?.focus()
      labelRef.current?.select()
      clearFocusRequest()
    }
  }, [focusRequest, snippet.id, clearFocusRequest])

  // Which `{{variables}}` this snippet references, split into filled vs unset.
  const { used, missing } = classifyVariables(snippet.content, variables)
  const referenced = [...used, ...missing]

  // Safety net: if this button unmounts (e.g. card switch) while flashing, make
  // sure we don't leave a stale marker pointing at us.
  useEffect(() => {
    return () => {
      if (useDeckStore.getState().lastCopiedSnippetId === snippet.id) {
        clearLastCopied(snippet.id)
      }
    }
  }, [snippet.id, clearLastCopied])

  function copy(): void {
    void copySnippet(cardId, snippet.id)
  }

  function onDragStartOut(e: React.DragEvent): void {
    // Native drag-out: dropping onto any text field pastes the content. Apply
    // the same `{{variable}}` substitution as copy so drag and copy agree (#7).
    e.dataTransfer.setData('text/plain', renderSnippet(snippet.content, variables))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      {...targetHandlers}
      className={`relative rounded-lg border border-deck-border bg-deck-card ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      {/* Insertion indicators for reordering */}
      {dropAbove && (
        <span className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded bg-deck-accent" />
      )}
      {dropBelow && (
        <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded bg-deck-accent" />
      )}

      {/* Header row: reorder grip, drag-out handle, label, copy, expand, delete */}
      <div className="flex items-center gap-2 p-2">
        <span
          {...sourceHandlers}
          className="cursor-grab select-none px-1 text-deck-muted active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden="true"
        >
          ⠿
        </span>
        <span
          draggable
          onDragStart={onDragStartOut}
          className="cursor-grab select-none rounded bg-deck-panel px-2 py-1 text-xs text-deck-muted active:cursor-grabbing"
          title="Drag me into your demo app"
        >
          {index + 1} ↗
        </span>
        <input
          id={contentLabelFieldId(snippet.id)}
          ref={labelRef}
          value={snippet.label}
          onChange={(e) => updateSnippet(cardId, snippet.id, { label: e.target.value })}
          placeholder={BUILD_LANGUAGE.content.labelPlaceholder}
          aria-label="Content label"
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <button
          onClick={copy}
          className={`rounded px-3 py-1 text-sm font-medium transition ${
            copied
              ? 'bg-green-600 text-white'
              : 'bg-deck-accent text-white hover:bg-deck-accentHover'
          }`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded px-2 py-1 text-sm text-deck-muted transition hover:text-deck-text"
          title={expanded ? 'Collapse' : 'Edit content'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <ConfirmDeleteButton
          onConfirm={() => removeSnippet(cardId, snippet.id)}
          label="✕"
          confirmLabel="Delete?"
          title={BUILD_LANGUAGE.content.singular + ' — delete'}
          className="rounded px-1.5 py-1 text-sm text-deck-muted transition hover:text-red-400"
        />
      </div>

      {/* Referenced-variable chips (#7): shows which `{{variables}}` this snippet
          uses; unset ones are flagged amber so the author knows to fill them. */}
      {referenced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t border-deck-border px-2 py-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-wide text-deck-muted">uses</span>
          {referenced.map((name) => {
            const isMissing = missing.includes(name)
            return (
              <span
                key={name}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                  isMissing
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-deck-panel text-deck-muted'
                }`}
                title={
                  isMissing
                    ? `{{${name}}} has no value — it will show a placeholder marker when copied. Set it in the Variables panel.`
                    : `{{${name}}} → defined in Variables`
                }
              >
                {name}
                {isMissing && ' ⚠'}
              </span>
            )
          })}
        </div>
      )}

      {/* Content preview / editor */}
      {expanded ? (
        <textarea
          value={snippet.content}
          onChange={(e) => updateSnippet(cardId, snippet.id, { content: e.target.value })}
          placeholder="The text you paste into your demo app…"
          rows={4}
          className="w-full resize-y rounded-b-lg border-t border-deck-border bg-deck-panel p-3 font-mono text-sm outline-none placeholder:text-deck-muted"
        />
      ) : (
        snippet.content && (
          <div
            onClick={() => setExpanded(true)}
            className="cursor-text truncate border-t border-deck-border px-3 py-2 font-mono text-xs text-deck-muted"
          >
            {snippet.content.split('\n')[0]}
          </div>
        )
      )}
    </div>
  )
}
