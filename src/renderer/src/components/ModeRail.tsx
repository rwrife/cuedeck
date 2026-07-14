import { WORKSPACE_MODES, isModeAvailable, type WorkspaceMode } from '@shared/workspace'
import { useDeckStore } from '../store/deckStore'
import { cx } from '../lib/ui/classNames'
import { resolveAriaDisabled } from '../lib/ui/variants'
import { Tooltip } from './ui/Tooltip'
import { BuildIcon, LibraryIcon, PlayIcon, RehearseIcon } from './ui/icons'

const MODE_LABEL: Record<WorkspaceMode, string> = {
  library: 'Library',
  build: 'Build',
  rehearse: 'Rehearse',
  present: 'Present'
}

const MODE_ICON: Record<WorkspaceMode, JSX.Element> = {
  library: <LibraryIcon />,
  build: <BuildIcon />,
  rehearse: <RehearseIcon />,
  present: <PlayIcon />
}

/**
 * Persistent, accessible Studio mode navigation (#33): Library, Build,
 * Rehearse, and Present.
 *
 * Library is always enabled; the deck-specific modes are unavailable until a
 * deck is open. Unavailable modes stay in the tab order — via `aria-disabled`
 * rather than the native `disabled` attribute — with a click/Enter/Space
 * guard that no-ops the mode change, so keyboard users can still discover
 * *why* a mode is unavailable (a {@link Tooltip} describing it) instead of a
 * native `disabled` control silently vanishing from focus order. The active
 * mode is announced via `aria-current="page"` so the current context is
 * always clear to assistive tech, matching the always-visible active mode +
 * one primary next action the Information Architecture calls for.
 *
 * A plain `nav` of native buttons (rather than the `radiogroup` roving-
 * tabindex pattern used by {@link ./ui/SegmentedControl}) keeps every mode —
 * including unavailable ones — in the normal tab order semantics screen
 * readers expect from primary app navigation.
 */
export function ModeRail(): JSX.Element {
  const workspaceMode = useDeckStore((s) => s.workspaceMode)
  const hasDeck = useDeckStore((s) => s.deck !== null)
  const selectWorkspaceMode = useDeckStore((s) => s.selectWorkspaceMode)

  return (
    <nav aria-label="Studio modes" className="flex items-center gap-1">
      {WORKSPACE_MODES.map((mode) => {
        const active = mode === workspaceMode
        const available = isModeAvailable(mode, hasDeck)

        const button = (
          <button
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-disabled={resolveAriaDisabled(available)}
            onClick={() => {
              // Guarded activation: `aria-disabled` (unlike `disabled`) has no
              // built-in effect on click/keydown, so the no-op has to be
              // enforced here — the button stays focusable either way.
              if (available) selectWorkspaceMode(mode)
            }}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium',
              'transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-40',
              active
                ? 'bg-deck-accent text-white'
                : 'text-deck-muted hover:bg-deck-card hover:text-deck-text'
            )}
          >
            {MODE_ICON[mode]}
            <span>{MODE_LABEL[mode]}</span>
          </button>
        )

        return (
          <span key={mode}>
            {available ? (
              button
            ) : (
              <Tooltip label={`${MODE_LABEL[mode]} — open or create a deck first`}>
                {button}
              </Tooltip>
            )}
          </span>
        )
      })}
    </nav>
  )
}
