import { useEffect } from 'react'
import { useDeckStore } from './store/deckStore'
import { useSettingsStore } from './store/settingsStore'
import { useApplyTheme } from './hooks/useApplyTheme'
import { DeckPicker } from './components/DeckPicker'
import { DeckWorkspace } from './components/DeckWorkspace'
import { SettingsModal } from './components/SettingsModal'
import { LiveControlPanel } from './components/LiveControlPanel'
import { initLiveControlBridge } from './liveControlClient'

/**
 * Root component. Shows the DeckPicker until a deck is open, then the workspace.
 * Loads user settings once and keeps the document theme + font scale in sync
 * (#8), mounts the app-wide {@link SettingsModal} and {@link LiveControlPanel},
 * and wires the renderer into the live demo control bridge (#17) so it can
 * publish state + apply remote commands while the app runs.
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

  // Subscribe to bridge commands + publish runtime state for the lifetime of
  // the app. Cheap and always-on; the bridge only serves state when a client
  // connects (and only after the user opts in).
  useEffect(() => initLiveControlBridge(), [])

  return (
    <div className="h-full w-full bg-deck-bg text-deck-text">
      {deck ? <DeckWorkspace /> : <DeckPicker />}
      <SettingsModal />
      <LiveControlPanel />
    </div>
  )
}
