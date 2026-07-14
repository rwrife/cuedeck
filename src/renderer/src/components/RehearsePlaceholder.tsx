import { useDeckStore } from '../store/deckStore'
import { RehearseIcon } from './ui/icons'

/**
 * Minimal Rehearse mode boundary (#33).
 *
 * Full readiness checks and a guided run-through are #36's scope; this is
 * only the shell placeholder that lets Rehearse exist as a real, navigable
 * mode — reachable from the mode rail once a deck is open, and able to reach
 * Present via the shared page header's primary action — without inventing
 * any readiness logic ahead of that issue.
 */
export function RehearsePlaceholder(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="text-deck-muted" aria-hidden="true">
        <RehearseIcon width="2.5em" height="2.5em" />
      </span>
      <h2 className="text-lg font-semibold">Rehearse {deck ? deck.name : 'this deck'}</h2>
      <p className="max-w-md text-sm text-deck-muted">
        A guided run-through and readiness checks are coming soon. For now, use{' '}
        <strong className="font-medium text-deck-text">Start Presenting</strong> above to run the
        demo, or switch to Build to keep editing.
      </p>
    </div>
  )
}
