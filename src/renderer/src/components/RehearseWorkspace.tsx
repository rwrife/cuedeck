import { useMemo, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { positionLabel } from '@shared/presenter'
import { evaluateReadiness, type ReadinessWarning } from '@shared/readiness'
import { CardList } from './CardList'
import { MarkdownNotes } from './MarkdownNotes'
import { ReadOnlySnippet } from './ReadOnlySnippet'

/**
 * The deck-readiness preflight banner (#36).
 *
 * Renders the derived readiness warnings for the open deck: what each concern is
 * and a one-click link to the exact Build location that resolves it. Warnings
 * inform but never block — the Start Presenting action stays enabled regardless.
 * Readiness is recomputed from the deck on every render and is never persisted.
 */
function ReadinessPreflight({
  warnings,
  onStart
}: {
  warnings: readonly ReadinessWarning[]
  onStart: () => void
}): JSX.Element {
  const focusBuildTarget = useDeckStore((s) => s.focusBuildTarget)
  const [dismissed, setDismissed] = useState(false)

  const ready = warnings.length === 0

  return (
    <section
      aria-label="Deck readiness"
      className="border-b border-deck-border bg-deck-panel"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {ready ? (
            <span className="font-semibold text-green-500">✓ Ready to present</span>
          ) : (
            <>
              <span className="font-semibold text-amber-500">
                {warnings.length} thing{warnings.length === 1 ? '' : 's'} to review
              </span>
              <span className="truncate text-deck-muted">
                before you present — none of these block you.
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!ready && (
            <button
              onClick={() => setDismissed((d) => !d)}
              className="rounded px-2 py-1 text-xs text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
              aria-expanded={!dismissed}
            >
              {dismissed ? 'Show details' : 'Hide details'}
            </button>
          )}
          <button
            onClick={onStart}
            className="rounded-lg bg-deck-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
            title="Start the compact, always-on-top demo view (F5)"
          >
            Start Presenting ▶︎
          </button>
        </div>
      </div>

      {!ready && !dismissed && (
        <ul className="flex flex-col gap-1.5 px-4 pb-3">
          {warnings.map((w) => (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-deck-card px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm text-deck-text">
                <span className="mr-1.5 select-none text-amber-500" aria-hidden>
                  ⚠
                </span>
                {w.message}
              </span>
              <button
                onClick={() => focusBuildTarget(w.fix)}
                className="shrink-0 rounded border border-deck-border px-2 py-1 text-xs font-semibold text-deck-accent transition hover:border-deck-accent hover:bg-deck-panel"
                title={
                  w.fix.target === 'step'
                    ? 'Open this step in Build'
                    : `Fill in the “${w.fix.name}” variable in Build`
                }
              >
                {w.fix.target === 'step' ? 'Fix in Build →' : 'Set value →'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The Rehearse workspace (#33, #36): practice the running order in full-window
 * chrome before going live, guided by a deck-readiness preflight.
 *
 * Unlike Present (compact + always-on-top), Rehearse stays in the normal
 * window with the running order visible on the left, so the user can move
 * through the deck, read the rendered talking points, and try the copy/drag
 * paste actions without committing to the floating presenter window. A preflight
 * banner surfaces derived readiness warnings (empty titles, missing variable
 * values, low-content steps) with one-click links to the exact Build location
 * that fixes each one; warnings inform but never block. A single, clear Start
 * Presenting action enters the compact Presenter surface regardless. Exiting
 * Present lands back here.
 */
export function RehearseWorkspace(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const startPresenting = useDeckStore((s) => s.startPresenting)

  // Demo hotkeys work here too: 1–9 copy, ←/→ change cards.
  useHotkeys()

  // Readiness is derived on demand from the deck; recompute whenever the deck
  // changes and never persist it (#36 acceptance criteria).
  const readiness = useMemo(() => evaluateReadiness(deck), [deck])

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length
  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-deck-border bg-deck-panel">
        <CardList />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <ReadinessPreflight warnings={readiness.warnings} onStart={startPresenting} />

        <header className="flex items-center justify-between border-b border-deck-border bg-deck-panel px-4 py-2 text-sm text-deck-muted">
          <span>Rehearsal — practice before you present</span>
          <span className="font-mono tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </header>

        {card ? (
          <div
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6"
            style={{ fontSize: 'calc(1rem * var(--deck-font-scale, 1))' }}
          >
            <h1 className="text-2xl font-bold leading-tight">{card.title || 'Untitled card'}</h1>
            {card.notes.trim() ? (
              <MarkdownNotes
                source={card.notes}
                className="text-lg leading-relaxed text-deck-text"
              />
            ) : (
              <p className="text-base italic text-deck-muted">No talking points for this card.</p>
            )}
            {card.snippets.length > 0 && (
              <div className="flex flex-col gap-2">
                {card.snippets.map((snippet, i) => (
                  <ReadOnlySnippet key={snippet.id} cardId={card.id} snippet={snippet} index={i} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-deck-muted">
            {total === 0 ? 'This deck has no cards yet.' : 'No card selected.'}
          </div>
        )}

        <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-4 py-2.5">
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
      </main>
    </div>
  )
}
