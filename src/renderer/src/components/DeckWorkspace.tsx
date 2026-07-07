import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
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

  // Demo hotkeys: 1–9 copy the active card's snippets, ←/→ change cards.
  useHotkeys()

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
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <CardEditor />
          </div>
          {/* Keyboard-hint legend */}
          <footer className="flex items-center justify-center gap-2 border-t border-deck-border bg-deck-panel px-4 py-1.5 text-xs text-deck-muted">
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">1–9</kbd>
            <span>copy</span>
            <span className="text-deck-border">·</span>
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">←</kbd>
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">→</kbd>
            <span>cards</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
