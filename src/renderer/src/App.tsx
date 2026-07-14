import { useEffect } from 'react'
import { useDeckStore } from './store/deckStore'
import { useSettingsStore } from './store/settingsStore'
import { useApplyTheme } from './hooks/useApplyTheme'
import { useHotkeys } from './hooks/useHotkeys'
import { isPresenterToggleKey } from '@shared/presenter'
import { StudioShell } from './components/StudioShell'
import { PresenterView } from './components/PresenterView'
import { CommandPalette } from './components/CommandPalette'
import { SettingsModal } from './components/SettingsModal'
import { LiveControlPanel } from './components/LiveControlPanel'
import { BuildAdvancedPanel } from './components/BuildAdvancedPanel'
import { initLiveControlBridge } from './liveControlClient'

/**
 * Root component. Renders the CueDeck Studio shell (Library, Build, and
 * Rehearse — see {@link StudioShell}) for every mode except Present, which
 * takes over as its own compact, chrome-free surface (#33). Loads user
 * settings once and keeps the document theme + font scale in sync (#8),
 * mounts the app-wide {@link SettingsModal}, {@link LiveControlPanel}, and
 * Build's {@link BuildAdvancedPanel} (export/live-control/pin, #35), and
 * wires the renderer into the live demo control bridge (#17) so it can
 * publish state + apply remote commands while the app runs.
 */
export default function App(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)
  const workspaceMode = useDeckStore((s) => s.workspaceMode)
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

  // Demo hotkeys: 1–9 copy the active card's snippets, ←/→ change cards.
  // Mounted app-wide (rather than inside a single mode's content) so they
  // keep working identically in Build, Rehearse, and Present, matching their
  // prior behavior.
  useHotkeys()

  // Safe shutdown (#38): when the main process is about to close the window it
  // asks us to flush pending debounced edits first. Flush, then let preload ack.
  useEffect(
    () => window.cuedeck.app.onFlushRequest(() => useDeckStore.getState().flushPendingSave()),
    []
  )

  // Present toggle (F5 / Ctrl/Cmd+P), available whenever a deck is open —
  // registered here rather than in useHotkeys because it must fire even
  // while a Ctrl/Cmd modifier is held, which the copy/nav hotkeys deliberately
  // ignore. Present exits back to Rehearse (#33).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!isPresenterToggleKey(e)) return
      const state = useDeckStore.getState()
      if (!state.deck) return
      e.preventDefault()
      if (state.workspaceMode === 'present') state.exitPresent()
      else void state.enterPresent()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="h-full w-full bg-deck-bg text-deck-text">
      {workspaceMode === 'present' && deck ? <PresenterView /> : <StudioShell />}
      <SettingsModal />
      <LiveControlPanel />
      <BuildAdvancedPanel />
      {/* Quick-search / command palette overlay (/ or Ctrl/Cmd+K), available
          in Build and Rehearse — not shown over the compact Present surface. */}
      {deck && workspaceMode !== 'present' && <CommandPalette />}
    </div>
  )
}
