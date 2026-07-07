import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import type { DragSourceHandlers, DropTargetHandlers } from '../hooks/useDragSort'

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
  // Flash "Copied ✓" whenever this snippet is the last-copied one — whether the
  // copy came from this button or from a number-key hotkey.
  const copied = useDeckStore((s) => s.lastCopiedSnippetId === snippet.id)
  const [expanded, setExpanded] = useState(false)

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
    // Native drag-out: dropping onto any text field pastes the content.
    e.dataTransfer.setData('text/plain', snippet.content)
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
          value={snippet.label}
          onChange={(e) => updateSnippet(cardId, snippet.id, { label: e.target.value })}
          placeholder="Label…"
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
        <button
          onClick={() => removeSnippet(cardId, snippet.id)}
          className="rounded px-1.5 py-1 text-sm text-deck-muted transition hover:text-red-400"
          title="Delete snippet"
        >
          ✕
        </button>
      </div>

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
