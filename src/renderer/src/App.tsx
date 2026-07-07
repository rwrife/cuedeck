import { useEffect } from 'react'
import { useDeckStore } from './store/deckStore'
import { useSettingsStore } from './store/settingsStore'
import { useApplyTheme } from './hooks/useApplyTheme'
import { DeckPicker } from './components/DeckPicker'
import { DeckWorkspace } from './components/DeckWorkspace'
import { SettingsModal } from './components/SettingsModal'

/**
 * Root component. Shows the DeckPicker until a deck is open, then the workspace.
 * Loads user settings once and keeps the document theme + font scale in sync
 * (#8), and mounts the app-wide {@link SettingsModal} so it's reachable from
 * both the picker and the workspace.
 */
export default function App(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)
  const refreshSummaries = useDeckStore((s) => s.refreshSummaries)
  const loadSettings = useSettingsStore((s) => s.load)

  // Apply theme (dark/light/system) + presenter font scale to <html>.
  useApplyTheme()

  useEffect(() => {
    refreshSummaries()
    loadSettings()
  }, [refreshSummaries, loadSettings])

  return (
    <div className="h-full w-full bg-deck-bg text-deck-text">
      {deck ? <DeckWorkspace /> : <DeckPicker />}
      <SettingsModal />
    </div>
  )
}
