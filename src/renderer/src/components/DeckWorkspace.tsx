import { useDeckStore } from '../store/deckStore'
import { CardList } from './CardList'
import { CardEditor } from './CardEditor'
import { KeyboardHint } from './ui/KeyboardHint'
import { StatusBanner } from './ui/StatusBanner'
import { Button } from './ui/Button'

/**
 * Build mode content (#35 guided Build workspace): the two-pane authoring
 * surface.
 *  - left: the running-order navigator (the current steps)
 *  - right: the active step's editor (talking points + paste-ready content)
 *
 * Adding a step goes through the store's {@link useDeckStore.addCard}, which
 * marks the new step for focus via the shared one-shot `focusCardId` (#34/#35)
 * so {@link CardEditor} focuses/selects its title the instant it renders — the
 * same single mechanism the guided New Demo blank/starter-template flows use,
 * so newly created content never sits unfocused waiting for a second click.
 *
 * The page header, mode navigation, and secondary actions (Search, the
 * Build-tools disclosure, Close deck) are owned by the shared
 * {@link ./StudioShell} — this component only renders the authoring body and
 * any save/operation feedback relevant to Build.
 */
export function DeckWorkspace(): JSX.Element {
  const addCard = useDeckStore((s) => s.addCard)
  const saveStatus = useDeckStore((s) => s.saveStatus)
  const saveError = useDeckStore((s) => s.saveError)
  const retrySave = useDeckStore((s) => s.retrySave)
  const statusMessage = useDeckStore((s) => s.statusMessage)
  const setStatusMessage = useDeckStore((s) => s.setStatusMessage)

  // Adding a step arms the store's one-shot focus request (focusCardId) and
  // makes the step active; CardEditor consumes it on render. No component-local
  // focus bookkeeping is needed — see the module docstring.
  function handleAddCard(): void {
    addCard()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Save failures must be visible where they occur, not just as a header
          label (#38) — offer an immediate retry right here in Build. */}
      {saveStatus === 'error' && saveError && (
        <StatusBanner tone="danger" className="mx-4 mt-3">
          <span className="flex flex-wrap items-center gap-2">
            <span>Save failed: {saveError.message}</span>
            <Button variant="secondary" size="sm" onClick={() => void retrySave()}>
              Retry
            </Button>
          </span>
        </StatusBanner>
      )}
      {/* Other Build-relevant feedback (e.g. "Added N variables") that would
          otherwise only be visible on the Library picker. */}
      {statusMessage && (
        <StatusBanner
          tone="neutral"
          onDismiss={() => setStatusMessage(null)}
          className="mx-4 mt-3"
        >
          {statusMessage}
        </StatusBanner>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-deck-border bg-deck-panel">
          <CardList onAddCard={handleAddCard} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <CardEditor onAddCard={handleAddCard} />
          </div>
          {/* Keyboard-hint legend */}
          <footer className="flex items-center justify-center gap-2 border-t border-deck-border bg-deck-panel px-4 py-1.5 text-xs text-deck-muted">
            <KeyboardHint keys={['1–9']} />
            <span>copy</span>
            <span className="text-deck-border">·</span>
            <KeyboardHint keys={['←', '→']} />
            <span>steps</span>
            <span className="text-deck-border">·</span>
            <KeyboardHint keys={['/']} />
            <span>search</span>
            <span className="text-deck-border">·</span>
            <KeyboardHint keys={['F5']} />
            <span>rehearse</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
