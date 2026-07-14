import { useEffect, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import { classifyVariables, renderSnippet } from '@shared/variables'
import type { DragSourceHandlers, DropTargetHandlers } from '../hooks/useDragSort'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  GripIcon,
  WarningIcon
} from './ui/icons'

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
  /** This item was just created (#35): mount expanded and focus/select its
   *  label immediately, instead of leaving new content collapsed and
   *  requiring a second click before it can be edited. */
  autoFocus?: boolean
  /** Called once autoFocus has been applied, so the parent can clear its
   *  pending-focus id and avoid refocusing on a later re-render. */
  onAutoFocused?: () => void
}

/**
 * The core interaction unit — one piece of paste-ready content. Each item is:
 *  - editable (label + content)
 *  - one-click copy to clipboard (with a "Copied ✓" flash)
 *  - draggable OUT: drag the numbered handle straight into another app's field
 *  - reorderable: drag the dedicated grip (⠿) to sort within the step
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
  dragging,
  autoFocus,
  onAutoFocused
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
  const [expanded, setExpanded] = useState(autoFocus ?? false)
  const labelRef = useRef<HTMLInputElement | null>(null)

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

  // Expand + focus/select the label the instant this item was just created
  // (#35) — new paste-ready content must never sit collapsed and unfocused.
  useEffect(() => {
    if (autoFocus) {
      setExpanded(true)
      labelRef.current?.focus()
      labelRef.current?.select()
      onAutoFocused?.()
    }
    // Only re-run when the autoFocus flag itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

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
          <GripIcon />
        </span>
        <span
          draggable
          onDragStart={onDragStartOut}
          className="flex cursor-grab select-none items-center gap-1 rounded bg-deck-panel px-2 py-1 text-xs text-deck-muted active:cursor-grabbing"
          title="Drag me into your demo app"
        >
          {index + 1} <ArrowUpRightIcon />
        </span>
        <input
          ref={labelRef}
          value={snippet.label}
          onChange={(e) => updateSnippet(cardId, snippet.id, { label: e.target.value })}
          placeholder="Label…"
          aria-label="Paste-ready content label"
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <Button
          variant="primary"
          size="sm"
          active={copied}
          activeTone="success"
          onClick={copy}
          icon={copied ? <CheckIcon /> : undefined}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <IconButton
          label={expanded ? 'Collapse content' : 'Edit content'}
          icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        />
        <IconButton
          label="Delete paste-ready content"
          icon={<CloseIcon />}
          size="sm"
          onClick={() => removeSnippet(cardId, snippet.id)}
          className="hover:!text-deck-danger"
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
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] ${
                  isMissing
                    ? 'bg-deck-warning/15 text-deck-warning'
                    : 'bg-deck-panel text-deck-muted'
                }`}
                title={
                  isMissing
                    ? `{{${name}}} has no value — it will show a placeholder marker when copied. Set it in the Variables panel.`
                    : `{{${name}}} → defined in Variables`
                }
              >
                {name}
                {isMissing && <WarningIcon />}
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
          aria-label="Paste-ready content"
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
