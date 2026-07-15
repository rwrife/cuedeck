import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { StatusBanner } from './ui/StatusBanner'
import { OPEN_LIVE_CONTROL_EVENT } from './LiveControlPanel'
import { CloseIcon, PinIcon, SlidersIcon } from './ui/icons'

/**
 * Custom DOM event other components can dispatch to open Build's "Advanced"
 * panel (e.g. the overflow button in the Studio shell header). Mirrors the
 * settings-modal / command-palette / live-control-panel pattern so entry
 * points stay decoupled (#35).
 */
export const OPEN_BUILD_ADVANCED_EVENT = 'cuedeck:open-build-advanced'

/**
 * Build's "Advanced" disclosure (#35 guided Build workspace).
 *
 * Houses the technical/infrequent deck-level actions — export, live control,
 * and keep-on-top — that don't belong in the primary Build header competing
 * with Rehearse, the one primary next action. Everything here remains fully
 * available; it's just tucked one click away instead of sitting in the
 * header at equal visual weight (Visual Direction: "one visually dominant
 * action per view").
 */
export function BuildAdvancedPanel(): JSX.Element | null {
  const deck = useDeckStore((s) => s.deck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const exportError = useDeckStore((s) => s.errors.export)
  const clearOperationError = useDeckStore((s) => s.clearOperationError)

  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [liveActive, setLiveActive] = useState(false)

  useEffect(() => {
    function onOpen(): void {
      setOpen(true)
      window.cuedeck.window.getAlwaysOnTop().then(setPinned)
      window.cuedeck.live.getStatus().then((s) => setLiveActive(s.enabled))
    }
    window.addEventListener(OPEN_BUILD_ADVANCED_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BUILD_ADVANCED_EVENT, onOpen)
  }, [])

  const close = (): void => setOpen(false)

  async function togglePin(): Promise<void> {
    const next = await window.cuedeck.window.toggleAlwaysOnTop()
    setPinned(next)
  }

  function openLiveControl(): void {
    close()
    window.dispatchEvent(new Event(OPEN_LIVE_CONTROL_EVENT))
  }

  if (!deck) return null

  return (
    <Dialog open={open} onClose={close} labelledBy="build-advanced-title" className="max-w-sm">
      <header className="flex items-center justify-between border-b border-deck-border px-5 py-3">
        <span id="build-advanced-title" className="font-semibold text-deck-text">
          Build tools
        </span>
        <IconButton label="Close" icon={<CloseIcon />} onClick={close} />
      </header>

      <div className="flex flex-col gap-3 px-5 py-4">
        {/* Export failures must be visible where the action occurred (#38),
            not only on the deck picker. */}
        {exportError && (
          <StatusBanner tone="danger" onDismiss={() => clearOperationError('export')}>
            {exportError.message}
          </StatusBanner>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-deck-text">Export deck</div>
            <div className="text-xs text-deck-muted">Save this deck as a .json file.</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void exportDeck(deck.id)}>
            Export…
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-deck-text">Live control</div>
            <div className="text-xs text-deck-muted">Let an MCP client drive this demo.</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<SlidersIcon />}
            active={liveActive}
            activeTone="success"
            onClick={openLiveControl}
          >
            {liveActive ? 'Active' : 'Open'}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-deck-text">Keep window on top</div>
            <div className="text-xs text-deck-muted">Useful while presenting.</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<PinIcon />}
            active={pinned}
            onClick={() => void togglePin()}
          >
            {pinned ? 'Pinned' : 'Pin'}
          </Button>
        </div>
      </div>

      <footer className="border-t border-deck-border px-5 py-3">
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      </footer>
    </Dialog>
  )
}
