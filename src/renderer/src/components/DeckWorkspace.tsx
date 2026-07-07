import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { CardList } from './CardList'
import { CardEditor } from './CardEditor'

/**
 * Main two-pane workspace shown when a deck is open:
 *  - left: card list (the running order)
 *  - right: the active card's editor (notes + snippets)
 */
export function DeckWorkspace(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const saving = useDeckStore((s) => s.saving)
  const closeDeck = useDeckStore((s) => s.closeDeck)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  async function togglePin(): Promise<void> {
    const next = await window.cuedeck.window.toggleAlwaysOnTop()
    setPinned(next)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-deck-border bg-deck-panel px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={closeDeck}
            className="rounded px-2 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Back to decks"
          >
            ← Decks
          </button>
          <h1 className="font-semibold">{deck.name}</h1>
          <span className="text-xs text-deck-muted">
            {saving ? 'Saving…' : 'Saved'}
          </span>
        </div>
        <button
          onClick={togglePin}
          className={`rounded px-3 py-1 text-sm transition ${
            pinned
              ? 'bg-deck-accent text-white'
              : 'text-deck-muted hover:bg-deck-card hover:text-deck-text'
          }`}
          title="Keep window on top during your demo"
        >
          📌 {pinned ? 'Pinned' : 'Pin on top'}
        </button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-deck-border bg-deck-panel">
          <CardList />
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">
          <CardEditor />
        </main>
      </div>
    </div>
  )
}
