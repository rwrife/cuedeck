import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import { renderSnippet } from '@shared/variables'
import { Icon } from '../ui'

/**
 * A single large, read-only copy button used by the Rehearse and Present
 * workspaces (#33).
 *
 * Deliberately minimal: a number/drag badge, the snippet label, and a big Copy
 * action with a "Copied ✓" flash. The badge doubles as a native drag-out handle
 * (drop onto any text field to paste). No editing, expanding, or deleting —
 * this is a demo surface, not the authoring surface.
 */
export function ReadOnlySnippet({
  cardId,
  snippet,
  index
}: {
  cardId: string
  snippet: Snippet
  index: number
}): JSX.Element {
  const copySnippet = useDeckStore((s) => s.copySnippet)
  const copied = useDeckStore((s) => s.lastCopiedSnippetId === snippet.id)
  const variables = useDeckStore((s) => s.deck?.variables)

  // Only 1–9 get a keyboard-visible number badge (matching the copy hotkeys).
  const hotkeyNumber = index < 9 ? index + 1 : null

  function onDragStartOut(e: React.DragEvent): void {
    e.dataTransfer.setData('text/plain', renderSnippet(snippet.content, variables))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      onClick={() => void copySnippet(cardId, snippet.id)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        copied
          ? 'border-deck-status-success bg-deck-statusSurface-success text-deck-status-success'
          : 'border-deck-border bg-deck-card text-deck-text hover:border-deck-accent hover:bg-deck-panel'
      }`}
      title={`Copy “${snippet.label || 'snippet'}” to the clipboard`}
    >
      <span
        draggable
        onDragStart={onDragStartOut}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-9 w-9 shrink-0 cursor-grab select-none items-center justify-center rounded-lg text-base font-bold active:cursor-grabbing ${
          copied ? 'bg-deck-status-success text-white' : 'bg-deck-accent text-white'
        }`}
        title="Drag me into your demo app"
        aria-hidden={hotkeyNumber === null}
      >
        {hotkeyNumber ?? '↗'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {snippet.label || 'Untitled snippet'}
        </span>
        {snippet.content && (
          <span className="mt-0.5 block truncate font-mono text-xs opacity-70">
            {snippet.content.split('\n')[0]}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold uppercase tracking-wide opacity-90">
        {copied ? (
          <>
            <Icon name="check" size={16} label="Copied" />
            Copied
          </>
        ) : (
          'Copy'
        )}
      </span>
    </button>
  )
}
