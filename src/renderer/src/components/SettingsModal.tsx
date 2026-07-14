import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import {
  FONT_SIZES,
  THEME_PREFERENCES,
  type FontSize,
  type ThemePreference
} from '@shared/settings'
import { Dialog } from './ui/Dialog'
import { SegmentedControl } from './ui/SegmentedControl'
import { Toggle } from './ui/Toggle'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { CloseIcon, SettingsIcon } from './ui/icons'

/**
 * Custom DOM event any component can dispatch to open the settings modal (e.g.
 * a "Settings" button in the deck picker or workspace header). Mirrors the
 * command-palette pattern so entry points stay decoupled — no lifted state or
 * refs required.
 */
export const OPEN_SETTINGS_EVENT = 'cuedeck:open-settings'

/** Human labels for the theme choices. */
const THEME_LABELS: Record<ThemePreference, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System'
}

/** Human labels for the font-size choices. */
const FONT_LABELS: Record<FontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large'
}

/** A labeled row wrapping a control, for consistent spacing/typography. */
function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="font-medium text-deck-text">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-deck-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * Settings modal (#8, migrated to the shared {@link Dialog}/{@link
 * SegmentedControl}/{@link Toggle} primitives by #32). Reachable from the
 * deck picker and the workspace header via the {@link OPEN_SETTINGS_EVENT}
 * custom event. Lets the user choose a theme (dark/light/system), presenter
 * font size, copy-feedback toggles, and the always-on-top default for
 * Presenter Mode. Every change is persisted immediately through the settings
 * store (→ settings.json in userData), so it survives restarts. Closes on
 * Esc or a backdrop click.
 */
export function SettingsModal(): JSX.Element | null {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  // Self-contained open/close, opened by the shared custom event.
  const [open, setOpen] = useOpenState()

  const close = useCallback(() => setOpen(false), [setOpen])

  return (
    <Dialog open={open} onClose={close} labelledBy="settings-modal-title">
      <header className="flex items-center justify-between border-b border-deck-border px-5 py-3.5">
        <h2
          id="settings-modal-title"
          className="flex items-center gap-2 text-lg font-semibold text-deck-text"
        >
          <SettingsIcon />
          Settings
        </h2>
        <IconButton label="Close settings" icon={<CloseIcon />} onClick={close} />
      </header>

      <div className="divide-y divide-deck-border px-5 py-1">
        <Row label="Theme" hint="Dark, light, or follow your operating system.">
          <SegmentedControl
            value={settings.theme}
            options={THEME_PREFERENCES}
            labels={THEME_LABELS}
            ariaLabel="Theme"
            onChange={(theme) => void update({ theme })}
          />
        </Row>

        <Row label="Presenter font size" hint="Scales talking-point notes in Presenter Mode.">
          <SegmentedControl
            value={settings.fontSize}
            options={FONT_SIZES}
            labels={FONT_LABELS}
            ariaLabel="Presenter font size"
            onChange={(fontSize) => void update({ fontSize })}
          />
        </Row>

        <Row label="Copy feedback" hint="Flash a “Copied” confirmation after copying a snippet.">
          <Toggle
            checked={settings.copyFlash}
            ariaLabel="Show copy feedback flash"
            onChange={(copyFlash) => void update({ copyFlash })}
          />
        </Row>

        <Row label="Copy sound" hint="Play a subtle click when a snippet is copied.">
          <Toggle
            checked={settings.copySound}
            ariaLabel="Play a sound on copy"
            onChange={(copySound) => void update({ copySound })}
          />
        </Row>

        <Row
          label="Always on top in Presenter Mode"
          hint="Pin the window above other apps when you start presenting."
        >
          <Toggle
            checked={settings.alwaysOnTopDefault}
            ariaLabel="Always on top in Presenter Mode by default"
            onChange={(alwaysOnTopDefault) => void update({ alwaysOnTopDefault })}
          />
        </Row>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-deck-border px-5 py-3 text-xs text-deck-muted">
        <span>Settings are saved automatically.</span>
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      </footer>
    </Dialog>
  )
}

/**
 * Small hook: owns the modal's boolean open state and wires it to the shared
 * {@link OPEN_SETTINGS_EVENT}. Extracted so the component body stays focused on
 * layout.
 */
function useOpenState(): [boolean, (next: boolean) => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onOpen(): void {
      setOpen(true)
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen)
  }, [])
  return [open, setOpen]
}
