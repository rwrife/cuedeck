import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  FONT_SIZES,
  THEME_PREFERENCES,
  type FontSize,
  type ThemePreference
} from '@shared/settings'

/**
 * Custom DOM event any component can dispatch to open the settings modal (e.g.
 * a "⚙ Settings" button in the deck picker or workspace header). Mirrors the
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

/** A small segmented control: one button per option, active one highlighted. */
function Segmented<T extends string>({
  value,
  options,
  labels,
  onChange,
  ariaLabel
}: {
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (next: T) => void
  ariaLabel: string
}): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-lg border border-deck-border"
    >
      {options.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 text-sm transition ${
              active
                ? 'bg-deck-accent text-white'
                : 'bg-deck-panel text-deck-muted hover:bg-deck-card hover:text-deck-text'
            }`}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}

/** An accessible on/off toggle switch. */
function Toggle({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        checked ? 'bg-deck-accent' : 'bg-deck-card border border-deck-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/**
 * Settings modal (#8). Reachable from the deck picker and the workspace header
 * via the {@link OPEN_SETTINGS_EVENT} custom event. Lets the user choose a
 * theme (dark/light/system), presenter font size, copy-feedback toggles, and
 * the always-on-top default for Presenter Mode. Every change is persisted
 * immediately through the settings store (→ settings.json in userData), so it
 * survives restarts. Closes on Esc or a backdrop click.
 */
export function SettingsModal(): JSX.Element | null {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  // Self-contained open/close, opened by the shared custom event.
  const [open, setOpen] = useOpenState()

  const close = useCallback(() => setOpen(false), [setOpen])

  // Trap focus inside the dialog while open and restore it on close (#39).
  const trapRef = useFocusTrap<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
      onClick={close}
      role="presentation"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-deck-border bg-deck-panel shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-deck-border px-5 py-3.5">
          <h2 className="text-lg font-semibold text-deck-text">⚙ Settings</h2>
          <button
            onClick={close}
            className="rounded px-2 py-1 text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            title="Close (Esc)"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <div className="divide-y divide-deck-border px-5 py-1">
          <Row label="Theme" hint="Dark, light, or follow your operating system.">
            <Segmented
              value={settings.theme}
              options={THEME_PREFERENCES}
              labels={THEME_LABELS}
              ariaLabel="Theme"
              onChange={(theme) => void update({ theme })}
            />
          </Row>

          <Row label="Presenter font size" hint="Scales talking-point notes in Presenter Mode.">
            <Segmented
              value={settings.fontSize}
              options={FONT_SIZES}
              labels={FONT_LABELS}
              ariaLabel="Presenter font size"
              onChange={(fontSize) => void update({ fontSize })}
            />
          </Row>

          <Row label="Copy feedback" hint="Flash “Copied ✓” after copying a snippet.">
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
          <button
            onClick={close}
            className="rounded-lg bg-deck-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-deck-accentHover"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
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
