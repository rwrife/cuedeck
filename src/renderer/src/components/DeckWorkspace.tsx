import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { isPresenterToggleKey } from '@shared/presenter'
import { CardList } from './CardList'
import { CardEditor } from './CardEditor'
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'
import { OPEN_SETTINGS_EVENT } from './SettingsModal'
import { OPEN_LIVE_CONTROL_EVENT } from './LiveControlPanel'
import { PresenterView } from './PresenterView'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { KeyboardHint } from './ui/KeyboardHint'
import { PinIcon, PlayIcon, SearchIcon, SettingsIcon, SlidersIcon } from './ui/icons'

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
  const [liveActive, setLiveActive] = useState(false)

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

  // Reflect the live-control active state on the header button. Poll lightly so
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
          <Button variant="ghost" size="sm" onClick={closeDeck} title="Back to decks">
            ← Decks
          </Button>
          <h1 className="font-semibold">{deck.name}</h1>
          <span className="text-xs text-deck-muted">{saving ? 'Saving…' : 'Saved'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<SearchIcon />}
            onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
            title="Search cards and snippets (/ or Ctrl/Cmd+K)"
          >
            Search
            <KeyboardHint keys={['/']} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<PlayIcon />}
            onClick={toggleMode}
            title="Start Presenter Mode — compact, always-on-top demo view (F5 or Ctrl/Cmd+P)"
          >
            Present
            <KeyboardHint keys={['F5']} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => exportDeck(deck.id)}
            title="Export this deck to a .json file"
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<SlidersIcon />}
            active={liveActive}
            activeTone="success"
            onClick={() => window.dispatchEvent(new Event(OPEN_LIVE_CONTROL_EVENT))}
            title="Live Control — let an MCP client drive this demo (opt-in, loopback-only)"
          >
            Live
          </Button>
          <IconButton
            label="Open settings"
            icon={<SettingsIcon />}
            size="sm"
            onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<PinIcon />}
            active={pinned}
            onClick={togglePin}
            title="Keep window on top during your demo"
          >
            {pinned ? 'Pinned' : 'Pin on top'}
          </Button>
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

      {/* Quick-search / command palette overlay (/ or Ctrl/Cmd+K). */}
      <CommandPalette />
    </div>
  )
}
