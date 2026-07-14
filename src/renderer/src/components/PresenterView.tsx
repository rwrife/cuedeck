import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { positionLabel, presenterShortcuts } from '@shared/presenter'
import { Button, Icon } from '../ui'
import { MarkdownNotes } from './MarkdownNotes'
import { ReadOnlySnippet } from './ReadOnlySnippet'

/**
 * Presenter Mode (#5, refined in #37): a compact, distraction-free, read-only
 * delivery surface for running a live demo, aligned with the CueDeck Studio
 * design system (#32).
 *
 * Shows the active card's title + talking-point notes (read-only, larger and
 * higher-contrast for readability from a distance), large numbered copy buttons
 * for its snippets, and prev/next controls with a "3 / 12" position indicator.
 * There are no editing controls here — no textareas, no delete buttons — so the
 * user can drive a demo without the authoring chrome getting in the way.
 *
 * Sparse steps (no notes, no snippets) are vertically centered so the compact
 * window never looks broken; content-heavy steps scroll within the same frame.
 *
 * Keyboard, mouse, and live-control navigation stay consistent: `useHotkeys`
 * wires the same 1–9 copy and ←/→ card-step shortcuts used in Build/Rehearse,
 * and a contextual shortcut strip surfaces them so the user never has to guess.
 *
 * The window-level side effects (compact size + always-on-top, restored on
 * exit) are handled by the store's `setMode` → `window.setPresenter` IPC; this
 * component only renders the layout and the read-only interactions. Exiting
 * returns to Rehearse (see the store's `exitPresent`).
 */
export function PresenterView(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const exitPresent = useDeckStore((s) => s.exitPresent)

  // Same demo hotkeys as Build/Rehearse: 1–9 copy the active card's snippets,
  // ←/→ move through the running order. Wiring them here keeps keyboard and
  // live-control navigation consistent with the rest of the app (#37).
  useHotkeys()

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length

  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  // A "sparse" step has neither talking points nor snippets — center it so the
  // compact window doesn't read as broken/empty.
  const hasNotes = !!card?.notes.trim()
  const hasSnippets = (card?.snippets.length ?? 0) > 0
  const sparse = !!card && !hasNotes && !hasSnippets

  const shortcuts = presenterShortcuts({
    snippetCount: card?.snippets.length ?? 0,
    canGoPrev: !atStart,
    canGoNext: !atEnd
  })

  // Track always-on-top so we can surface the state; the window is pinned on
  // entering presenter mode, but the user may have already had it pinned.
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  return (
    <div className="flex h-full flex-col bg-deck-bg text-deck-text">
      {/* Compact top bar: exit + on-top indicator + position. */}
      <header className="flex items-center justify-between gap-2 border-b border-deck-border bg-deck-panel px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon="close"
          onClick={exitPresent}
          title="Exit Presenter Mode to Rehearse (F5 or Ctrl/Cmd+P)"
        >
          Exit
        </Button>
        <span className="flex items-center gap-2 text-xs text-deck-muted">
          {pinned && (
            <Icon name="pin" size={14} label="Window pinned on top" className="text-deck-accent" />
          )}
          <span className="font-mono text-sm tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </span>
      </header>

      {/* Card body. Sparse steps center; content-heavy steps scroll. */}
      {card ? (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 ${
            sparse ? 'justify-center text-center' : ''
          }`}
          // Scale the presenter's talking-point typography by the font-size
          // preference (#8). Applied here (not on snippet buttons) so the demo
          // controls stay a consistent, tappable size.
          style={{ fontSize: 'calc(1rem * var(--deck-font-scale, 1))' }}
        >
          <h1 className="text-2xl font-bold leading-tight">{card.title || 'Untitled card'}</h1>

          {hasNotes ? (
            <MarkdownNotes source={card.notes} className="text-lg leading-relaxed text-deck-text" />
          ) : (
            !hasSnippets && (
              <p className="text-base italic text-deck-muted">No talking points for this card.</p>
            )
          )}

          {hasSnippets && (
            <div className="flex flex-col gap-2 text-left">
              {card.snippets.map((snippet, i) => (
                <ReadOnlySnippet key={snippet.id} cardId={card.id} snippet={snippet} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-deck-muted">
          {total === 0 ? 'This deck has no cards yet.' : 'No card selected.'}
        </div>
      )}

      {/* Contextual shortcut hints: never assume the shortcuts are memorized. */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-deck-border bg-deck-panel px-3 py-1.5 text-[11px] text-deck-muted"
        aria-label="Keyboard shortcuts"
      >
        {shortcuts.map((s) => (
          <span key={`${s.keys}-${s.label}`} className="flex items-center gap-1">
            <kbd className="rounded border border-deck-border bg-deck-card px-1.5 py-0.5 font-mono text-[10px] text-deck-text">
              {s.keys}
            </kbd>
            <span>{s.label}</span>
          </span>
        ))}
      </div>

      {/* Prev / next controls. */}
      <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-3 py-2.5">
        <Button
          variant="secondary"
          size="lg"
          leadingIcon="arrowLeft"
          onClick={() => stepActiveCard(-1)}
          disabled={atStart}
          className="flex-1"
          title="Previous card (←)"
          aria-label="Previous card"
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="lg"
          trailingIcon="arrowRight"
          onClick={() => stepActiveCard(1)}
          disabled={atEnd}
          className="flex-1"
          title="Next card (→)"
          aria-label="Next card"
        >
          Next
        </Button>
      </footer>
    </div>
  )
}
