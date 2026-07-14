import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { CardList } from './CardList'
import { CardEditor } from './CardEditor'
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'
import { OPEN_SETTINGS_EVENT } from './SettingsModal'
import { OPEN_LIVE_CONTROL_EVENT } from './LiveControlPanel'

/**
 * The Build workspace (#33): the full authoring surface for an open deck.
 *
 *  - left: card list (the running order)
 *  - right: the active card's editor (notes + snippets)
 *
 * The Studio shell provides the mode rail, page title, and primary next
 * action; this component owns the authoring panes plus the secondary,
 * deck-scoped actions (search, export, live control) that only make sense while
 * building. Present/Rehearse navigation and window pinning live in the shell.
 */
export function BuildWorkspace(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const [liveActive, setLiveActive] = useState(false)

  // Demo hotkeys: 1–9 copy the active card's snippets, ←/→ change cards.
  useHotkeys()

  // Reflect the live-control active state on the toolbar button. Poll lightly so
  // the indicator stays in sync when the panel enables/revokes the bridge.
  useEffect(() => {
    let alive = true
    function sync(): void {
      window.cuedeck.live.getStatus().then((s) => {
        if (alive) setLiveActive(s.enabled)
      })
    }
    sync()
    const id = window.setInterval(sync, 2000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Secondary, deck-scoped actions. Kept lightweight so the primary next
          action (in the shell header) stays prominent. */}
      <div className="flex items-center justify-end gap-2 border-b border-deck-border bg-deck-panel px-4 py-1.5">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
          className="flex items-center gap-2 rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title="Search cards and snippets (/ or Ctrl/Cmd+K)"
        >
          🔍 Search
          <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-xs">/</kbd>
        </button>
        <button
          onClick={() => exportDeck(deck.id)}
          className="rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title="Export this deck to a .json file"
        >
          Export
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_LIVE_CONTROL_EVENT))}
          className={`flex items-center gap-2 rounded px-3 py-1 text-sm transition ${
            liveActive
              ? 'bg-green-600 text-white'
              : 'text-deck-muted hover:bg-deck-card hover:text-deck-text'
          }`}
          title="Live Control — let an MCP client drive this demo (opt-in, loopback-only)"
        >
          🎛 Live
          {liveActive && <span className="h-2 w-2 rounded-full bg-white" aria-hidden />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
          className="rounded px-3 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title="Settings — theme, font size, and preferences"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </div>

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
