import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { primaryActionMode, type WorkspaceMode } from '@shared/workspace'
import { ModeRail } from './ModeRail'
import { Library } from './Library'
import { DeckWorkspace } from './DeckWorkspace'
import { RehearsePlaceholder } from './RehearsePlaceholder'
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'
import { OPEN_SETTINGS_EVENT } from './SettingsModal'
import { OPEN_LIVE_CONTROL_EVENT } from './LiveControlPanel'
import { OPEN_BUILD_ADVANCED_EVENT } from './BuildAdvancedPanel'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { KeyboardHint } from './ui/KeyboardHint'
import { PageHeader } from './ui/PageHeader'
import { saveStatusLabel } from '../lib/ui/saveStatusLabel'
import {
  ClapperboardIcon,
  CloseIcon,
  MoreIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon
} from './ui/icons'

const MODE_TITLE: Record<WorkspaceMode, string> = {
  library: 'Library',
  build: 'Build',
  rehearse: 'Rehearse',
  present: 'Present'
}

const PRIMARY_ACTION_LABEL: Partial<Record<WorkspaceMode, string>> = {
  build: 'Rehearse',
  rehearse: 'Start Presenting'
}

/**
 * The persistent CueDeck Studio shell (#33): brand mark + mode rail up top,
 * a shared page header with the current context and one primary next action,
 * and the active mode's content below.
 *
 * Present is intentionally *not* one of this shell's content branches — it
 * renders as its own compact, chrome-free surface (see `App`) so it can
 * become the reduced "focused delivery" shell the design calls for. This
 * component only ever shows Library, Build, or Rehearse.
 */
export function StudioShell(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)
  const saveStatus = useDeckStore((s) => s.saveStatus)
  const saveDirty = useDeckStore((s) => s.saveDirty)
  const workspaceMode = useDeckStore((s) => s.workspaceMode)
  const closeDeck = useDeckStore((s) => s.closeDeck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const selectWorkspaceMode = useDeckStore((s) => s.selectWorkspaceMode)
  const enterPresent = useDeckStore((s) => s.enterPresent)

  const [pinned, setPinned] = useState(false)
  const [liveActive, setLiveActive] = useState(false)

  const hasDeckContext = deck !== null && workspaceMode !== 'library'

  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  // Reflect the live-control active state on the header button. Poll lightly
  // so the indicator stays in sync when the panel enables/revokes the bridge.
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

  const primaryTarget = primaryActionMode(workspaceMode)
  const primaryLabel = primaryTarget ? PRIMARY_ACTION_LABEL[workspaceMode] : undefined

  // Header status line: current mode + accurate save state (#38). The reviewed
  // saveStatusLabel never reads "Saved" on failure and returns '' for a clean,
  // never-edited deck — in which case we show just the mode so there's no
  // dangling separator.
  const saveLabel = saveStatusLabel(saveStatus, saveDirty)
  const headerStatus = hasDeckContext
    ? saveLabel
      ? `${MODE_TITLE[workspaceMode]} · ${saveLabel}`
      : MODE_TITLE[workspaceMode]
    : undefined

  function activatePrimaryAction(): void {
    if (primaryTarget === 'present') {
      void enterPresent()
    } else if (primaryTarget) {
      selectWorkspaceMode(primaryTarget)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand + persistent mode rail + global Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-deck-border bg-deck-panel px-4 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex shrink-0 items-center gap-2 font-semibold">
            <ClapperboardIcon />
            CueDeck
          </span>
          <ModeRail />
        </div>
        <IconButton
          label="Open settings"
          icon={<SettingsIcon />}
          onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
        />
      </div>

      {/* Shared page header: current context + one primary next action */}
      <PageHeader
        title={deck && workspaceMode !== 'library' ? deck.name : MODE_TITLE[workspaceMode]}
        subtitle={
          workspaceMode === 'library'
            ? 'Your demo cue cards + instant clipboard snippets.'
            : undefined
        }
        status={headerStatus}
        secondaryActions={
          hasDeckContext ? (
            workspaceMode === 'build' ? (
              // Build (#35 guided Build workspace): keep Search — it's core to
              // navigating the running order — visible and prominent, but tuck
              // the technical/infrequent actions (export, live control, pin)
              // behind one "Build tools" disclosure so they never compete with
              // the single primary next action (Rehearse).
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<SearchIcon />}
                  onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
                  title="Search steps and paste-ready content (/ or Ctrl/Cmd+K)"
                >
                  Search
                  <KeyboardHint keys={['/']} />
                </Button>
                <IconButton
                  label="Build tools — export, live control, keep on top"
                  icon={<MoreIcon />}
                  size="sm"
                  onClick={() => window.dispatchEvent(new Event(OPEN_BUILD_ADVANCED_EVENT))}
                />
                <IconButton
                  label="Close deck (back to Library)"
                  icon={<CloseIcon />}
                  size="sm"
                  onClick={closeDeck}
                />
              </>
            ) : (
              <>
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
                  onClick={() => deck && exportDeck(deck.id)}
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
                <IconButton
                  label="Close deck (back to Library)"
                  icon={<CloseIcon />}
                  size="sm"
                  onClick={closeDeck}
                />
              </>
            )
          ) : undefined
        }
        primaryAction={
          primaryLabel && (
            <Button variant="primary" onClick={activatePrimaryAction}>
              {primaryLabel}
            </Button>
          )
        }
      />

      {/* Active mode content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {workspaceMode === 'library' && <Library />}
        {workspaceMode === 'build' && deck && <DeckWorkspace />}
        {workspaceMode === 'rehearse' && deck && <RehearsePlaceholder />}
      </div>
    </div>
  )
}
