import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { isPresenterToggleKey } from '@shared/presenter'
import { WORKSPACE_MODE_INFO, type WorkspaceMode } from '@shared/workspace'
import { ModeRail } from './ModeRail'
import { DeckPicker } from './DeckPicker'
import { BuildWorkspace } from './BuildWorkspace'
import { RehearseWorkspace } from './RehearseWorkspace'
import { PresenterView } from './PresenterView'

/** Look up the human label + hint for the active workspace mode. */
function modeInfo(mode: WorkspaceMode): (typeof WORKSPACE_MODE_INFO)[number] {
  return WORKSPACE_MODE_INFO.find((i) => i.mode === mode) ?? WORKSPACE_MODE_INFO[0]
}

/**
 * The primary "next action" surfaced in the shared page header for each mode,
 * so there is always one clear next step (acceptance criteria). Returns null
 * when the mode has no single obvious next action (e.g. an empty Library).
 */
function usePrimaryAction(): { label: string; onClick: () => void; hint: string } | null {
  const workspace = useDeckStore((s) => s.workspace)
  const hasDeck = useDeckStore((s) => s.deck !== null)
  const setWorkspace = useDeckStore((s) => s.setWorkspace)

  if (!hasDeck) return null

  switch (workspace) {
    case 'build':
      return {
        label: 'Rehearse ▶︎',
        hint: 'Practice the running order',
        onClick: () => setWorkspace('rehearse')
      }
    case 'rehearse':
      return {
        label: 'Present ▶︎',
        hint: 'Start the compact, always-on-top demo view (F5)',
        onClick: () => setWorkspace('present')
      }
    default:
      return null
  }
}

/**
 * The Studio shell (#33): the app frame that hosts the four workspace modes.
 *
 * Layout:
 *  - a persistent, accessible mode rail (Library / Build / Rehearse / Present)
 *  - a shared page header showing the deck name, the active mode, and one
 *    primary next action
 *  - the active workspace pane
 *
 * The Present workspace is special: it renders the compact, always-on-top
 * presenter window on its own (no rail/header) so it can float over a demo
 * target. Every other mode uses the full shell chrome. The shell stays usable
 * at the 640×480 minimum window and common text-scaling levels.
 */
export function StudioShell(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)
  const workspace = useDeckStore((s) => s.workspace)
  const saving = useDeckStore((s) => s.saving)
  const closeDeck = useDeckStore((s) => s.closeDeck)
  const primary = usePrimaryAction()

  // Presenter Mode toggle (F5 / Ctrl/Cmd+P), available whenever a deck is open.
  // Registered here so it fires even while a Ctrl/Cmd modifier is held.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!useDeckStore.getState().deck) return
      if (isPresenterToggleKey(e)) {
        e.preventDefault()
        const store = useDeckStore.getState()
        if (store.workspace === 'present') store.exitPresent()
        else store.setWorkspace('present')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Present renders the compact floating window without the shell chrome.
  if (workspace === 'present' && deck) {
    return <PresenterView />
  }

  const info = modeInfo(workspace)

  return (
    <div className="flex h-full w-full">
      <ModeRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Shared page header: deck + active mode + one primary next action. */}
        <header className="flex items-center justify-between gap-3 border-b border-deck-border bg-deck-panel px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {deck ? (
              <button
                onClick={closeDeck}
                className="rounded px-2 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
                title="Close deck and return to the Library"
              >
                ← Library
              </button>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate font-semibold" aria-live="polite">
                {deck ? deck.name : 'Library'}
                <span className="ml-2 text-sm font-normal text-deck-muted">{info.label}</span>
              </h1>
            </div>
            {deck ? (
              <span className="text-xs text-deck-muted">{saving ? 'Saving…' : 'Saved'}</span>
            ) : null}
          </div>
          {primary ? (
            <button
              onClick={primary.onClick}
              className="shrink-0 rounded-lg bg-deck-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
              title={primary.hint}
            >
              {primary.label}
            </button>
          ) : null}
        </header>

        {/* Active workspace pane. */}
        <div id="studio-pane" role="tabpanel" className="min-h-0 flex-1">
          {!deck || workspace === 'library' ? (
            <DeckPicker />
          ) : workspace === 'rehearse' ? (
            <RehearseWorkspace />
          ) : (
            <BuildWorkspace />
          )}
        </div>
      </div>
    </div>
  )
}
