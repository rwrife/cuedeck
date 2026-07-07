import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { isPresenterToggleKey } from '@shared/presenter'
import { CardList } from './CardList'
import { CardEditor } from './CardEditor'
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'
import { OPEN_SETTINGS_EVENT } from './SettingsModal'
import { PresenterView } from './PresenterView'

/**
 * Main two-pane workspace shown when a deck is open:
 *  - left: card list (the running order)
 *  - right: the active card's editor (notes + snippets)
 *
 * Switches to the compact, read-only {@link PresenterView} when the store's
 * `mode` is `'present'` (toggled by the header button or F5 / Ctrl/Cmd+P).
 */
export function DeckWorkspace(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const saving = useDeckStore((s) => s.saving)
  const mode = useDeckStore((s) => s.mode)
  const closeDeck = useDeckStore((s) => s.closeDeck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const toggleMode = useDeckStore((s) => s.toggleMode)
  const [pinned, setPinned] = useState(false)

  // Demo hotkeys: 1–9 copy the active card's snippets, ←/→ change cards.
  useHotkeys()

  // Presenter Mode toggle (F5 / Ctrl/Cmd+P), available whenever a deck is open.
  // Registered here rather than in useHotkeys because it must fire even while a
  // Ctrl/Cmd modifier is held — which the copy/nav hotkeys deliberately ignore.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isPresenterToggleKey(e)) {
        e.preventDefault()
        useDeckStore.getState().toggleMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  async function togglePin(): Promise<void> {
    const next = await window.cuedeck.window.toggleAlwaysOnTop()
    setPinned(next)
  }

  // Compact, read-only demo surface.
  if (mode === 'present') {
    return <PresenterView />
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
          <span className="text-xs text-deck-muted">{saving ? 'Saving…' : 'Saved'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
            className="flex items-center gap-2 rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Search cards and snippets (/ or Ctrl/Cmd+K)"
          >
            🔍 Search
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-xs">/</kbd>
          </button>
          <button
            onClick={toggleMode}
            className="rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Start Presenter Mode — compact, always-on-top demo view (F5 or Ctrl/Cmd+P)"
          >
            ▶︎ Present
            <kbd className="ml-2 rounded bg-deck-card px-1.5 py-0.5 font-mono text-xs">F5</kbd>
          </button>
          <button
            onClick={() => exportDeck(deck.id)}
            className="rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Export this deck to a .json file"
          >
            Export
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
            className="rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Settings — theme, font size, and preferences"
            aria-label="Open settings"
          >
            ⚙
          </button>
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
        </div>
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
            <span className="text-deck-border">·</span>
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">/</kbd>
            <span>search</span>
            <span className="text-deck-border">·</span>
            <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">F5</kbd>
            <span>present</span>
          </footer>
        </main>
      </div>

      {/* Quick-search / command palette overlay (/ or Ctrl/Cmd+K). */}
      <CommandPalette />
    </div>
  )
}
