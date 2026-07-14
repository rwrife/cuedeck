import { useEffect } from 'react'
import { useDeckStore } from './store/deckStore'
import { useSettingsStore } from './store/settingsStore'
import { useApplyTheme } from './hooks/useApplyTheme'
import { StudioShell } from './components/StudioShell'
import { SettingsModal } from './components/SettingsModal'
import { LiveControlPanel } from './components/LiveControlPanel'
import { initLiveControlBridge } from './liveControlClient'

/**
 * Root component. Renders the CueDeck Studio shell (#33) — the mode rail plus
 * the active Library/Build/Rehearse/Present workspace — and mounts the app-wide
 * {@link SettingsModal} and {@link LiveControlPanel}. Loads user settings once
 * and keeps the document theme + font scale in sync (#8), and wires the
 * renderer into the live demo control bridge (#17).
 */
export default function App(): JSX.Element {
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
      <StudioShell />
      <SettingsModal />
      <LiveControlPanel />
    </div>
  )
}
