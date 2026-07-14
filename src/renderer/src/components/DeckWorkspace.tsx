import { CardList } from './CardList'
import { CardEditor } from './CardEditor'
import { KeyboardHint } from './ui/KeyboardHint'

/**
 * Build mode content (#33 Studio shell): the two-pane authoring surface.
 *  - left: card list (the running order)
 *  - right: the active card's editor (notes + snippets)
 *
 * The page header, mode navigation, and secondary actions (Search, Export,
 * Live Control, Pin, Settings, Close deck) are now owned by the shared
 * {@link ./StudioShell} — this component only renders the authoring body, so
 * it composes cleanly as the Build mode's content.
 */
export function DeckWorkspace(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-72 shrink-0 border-r border-deck-border bg-deck-panel">
        <CardList />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <CardEditor />
        </div>
        {/* Keyboard-hint legend */}
        <footer className="flex items-center justify-center gap-2 border-t border-deck-border bg-deck-panel px-4 py-1.5 text-xs text-deck-muted">
          <KeyboardHint keys={['1–9']} />
          <span>copy</span>
          <span className="text-deck-border">·</span>
          <KeyboardHint keys={['←', '→']} />
          <span>cards</span>
          <span className="text-deck-border">·</span>
          <KeyboardHint keys={['/']} />
          <span>search</span>
          <span className="text-deck-border">·</span>
          <KeyboardHint keys={['F5']} />
          <span>present</span>
        </footer>
      </main>
    </div>
  )
}
