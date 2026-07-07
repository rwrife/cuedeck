import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import { positionLabel } from '@shared/presenter'

/**
 * A single large, read-only copy button used in Presenter Mode.
 *
 * Deliberately minimal: a big number badge, the snippet label, and a big Copy
 * action with a "Copied ✓" flash. The badge doubles as a native drag-out
 * handle (drop onto any text field to paste), mirroring the editor's snippet
 * drag affordance. No editing, expanding, or deleting here — this is the demo
 * surface, not the authoring surface.
 */
function PresenterSnippet({
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

  // Only 1–9 get a keyboard-visible number badge (matching the copy hotkeys).
  const hotkeyNumber = index < 9 ? index + 1 : null

  function onDragStartOut(e: React.DragEvent): void {
    e.dataTransfer.setData('text/plain', snippet.content)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      onClick={() => void copySnippet(cardId, snippet.id)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        copied
          ? 'border-green-500 bg-green-600 text-white'
          : 'border-deck-border bg-deck-card text-deck-text hover:border-deck-accent hover:bg-deck-panel'
      }`}
      title={`Copy “${snippet.label || 'snippet'}” to the clipboard`}
    >
      <span
        draggable
        onDragStart={onDragStartOut}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-9 w-9 shrink-0 cursor-grab select-none items-center justify-center rounded-lg text-base font-bold active:cursor-grabbing ${
          copied ? 'bg-white/25 text-white' : 'bg-deck-accent text-white'
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
      <span className="shrink-0 text-sm font-semibold uppercase tracking-wide opacity-90">
        {copied ? 'Copied ✓' : 'Copy'}
      </span>
    </button>
  )
}

/**
 * Presenter Mode (#5): a compact, distraction-free, read-only view for running
 * a live demo.
 *
 * Shows the active card's title + talking-point notes (read-only, larger and
 * higher-contrast for readability from a distance), large numbered copy buttons
 * for its snippets, and prev/next controls with a "3 / 12" position indicator.
 * There are no editing controls here — no textareas, no delete buttons — so the
 * user can drive a demo without the authoring chrome getting in the way.
 *
 * The window-level side effects (compact size + always-on-top, restored on
 * exit) are handled by the store's `setMode` → `window.setPresenter` IPC; this
 * component only renders the layout and the read-only interactions.
 */
export function PresenterView(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const setMode = useDeckStore((s) => s.setMode)

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length

  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  // Track always-on-top so we can surface the state; the window is pinned on
  // entering presenter mode, but the user may have already had it pinned.
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  return (
    <div className="flex h-full flex-col bg-deck-bg text-deck-text">
      {/* Compact top bar: exit + position + on-top indicator */}
      <header className="flex items-center justify-between gap-2 border-b border-deck-border bg-deck-panel px-3 py-2">
        <button
          onClick={() => setMode('edit')}
          className="rounded px-2 py-1 text-sm font-medium text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title="Exit Presenter Mode (F5 or Ctrl/Cmd+P)"
        >
          ✕ Exit
        </button>
        <span className="flex items-center gap-2 text-xs text-deck-muted">
          {pinned && (
            <span title="Window is pinned on top" aria-label="Pinned on top">
              📌
            </span>
          )}
          <span className="font-mono text-sm tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </span>
      </header>

      {/* Card body */}
      {card ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <h1 className="text-2xl font-bold leading-tight">
            {card.title || 'Untitled card'}
          </h1>

          {card.notes.trim() ? (
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-deck-text">
              {card.notes}
            </p>
          ) : (
            <p className="text-base italic text-deck-muted">No talking points for this card.</p>
          )}

          {card.snippets.length > 0 && (
            <div className="flex flex-col gap-2">
              {card.snippets.map((snippet, i) => (
                <PresenterSnippet key={snippet.id} cardId={card.id} snippet={snippet} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-deck-muted">
          {total === 0 ? 'This deck has no cards yet.' : 'No card selected.'}
        </div>
      )}

      {/* Prev / next controls */}
      <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-3 py-2.5">
        <button
          onClick={() => stepActiveCard(-1)}
          disabled={atStart}
          className="flex-1 rounded-lg border border-deck-border bg-deck-card py-2 text-lg font-semibold transition enabled:hover:border-deck-accent enabled:hover:bg-deck-panel disabled:cursor-not-allowed disabled:opacity-40"
          title="Previous card (←)"
          aria-label="Previous card"
        >
          ←
        </button>
        <button
          onClick={() => stepActiveCard(1)}
          disabled={atEnd}
          className="flex-1 rounded-lg border border-deck-border bg-deck-card py-2 text-lg font-semibold transition enabled:hover:border-deck-accent enabled:hover:bg-deck-panel disabled:cursor-not-allowed disabled:opacity-40"
          title="Next card (→)"
          aria-label="Next card"
        >
          →
        </button>
      </footer>
    </div>
  )
}
