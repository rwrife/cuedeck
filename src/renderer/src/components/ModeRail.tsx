import { useDeckStore } from '../store/deckStore'
import { WORKSPACE_MODE_INFO, canEnterMode, type WorkspaceMode } from '@shared/workspace'
import { Icon } from '../ui'
import type { IconName } from '@shared/icons'

/**
 * Map each Studio workspace mode to an accessible glyph from the shared icon
 * registry (#32). Kept here rather than in the shared data because it is a
 * renderer-only presentation concern.
 */
const MODE_ICON: Record<WorkspaceMode, IconName> = {
  library: 'deck',
  build: 'copy',
  rehearse: 'arrowRight',
  present: 'external'
}

/**
 * Persistent, accessible mode rail for the Studio shell (#33).
 *
 * Renders the four workspace modes as a vertical, keyboard-operable list. The
 * Library is always enabled; the deck-specific modes are disabled until a deck
 * is open. The rail is exposed as an ARIA tablist so screen readers announce
 * the active mode and how many modes exist, and each button is labeled with its
 * name plus a short hint.
 */
export function ModeRail(): JSX.Element {
  const workspace = useDeckStore((s) => s.workspace)
  const hasDeck = useDeckStore((s) => s.deck !== null)
  const setWorkspace = useDeckStore((s) => s.setWorkspace)

  // Roving-focus arrow navigation across the rail. Up/Down move to the nearest
  // enterable mode; Home/End jump to the first/last enterable mode. Skipping
  // disabled modes keeps the rail predictable for keyboard + screen-reader use.
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const enterable = WORKSPACE_MODE_INFO.filter((i) => canEnterMode(i.mode, hasDeck)).map(
      (i) => i.mode
    )
    if (enterable.length === 0) return
    const current = enterable.indexOf(workspace)
    let nextIndex: number
    if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = enterable.length - 1
    else {
      const step = e.key === 'ArrowDown' ? 1 : -1
      const from = current < 0 ? 0 : current
      nextIndex = (from + step + enterable.length) % enterable.length
    }
    const target = enterable[nextIndex]
    setWorkspace(target)
    // Move focus to the newly-selected tab so keyboard focus tracks selection.
    document.getElementById(`mode-tab-${target}`)?.focus()
  }

  return (
    <nav
      aria-label="Workspace modes"
      className="flex w-20 shrink-0 flex-col items-stretch gap-1 border-r border-deck-border bg-deck-panel py-3"
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      {WORKSPACE_MODE_INFO.map((info) => {
        const disabled = info.deckSpecific && !hasDeck
        const active = workspace === info.mode
        return (
          <button
            key={info.mode}
            role="tab"
            id={`mode-tab-${info.mode}`}
            aria-selected={active}
            aria-controls="studio-pane"
            aria-label={`${info.label}. ${info.hint}`}
            title={disabled ? `${info.label} — open a deck first` : `${info.label} — ${info.hint}`}
            disabled={disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => setWorkspace(info.mode)}
            className={`mx-2 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
              active
                ? 'bg-deck-accent text-white'
                : disabled
                  ? 'cursor-not-allowed text-deck-muted opacity-40'
                  : 'text-deck-muted hover:bg-deck-card hover:text-deck-text'
            }`}
          >
            <Icon name={MODE_ICON[info.mode]} size={20} label={null} />
            <span>{info.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
