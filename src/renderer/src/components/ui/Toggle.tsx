import { cx } from '../../lib/ui/classNames'

export interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  disabled?: boolean
}

/**
 * Shared on/off switch (#32 design-system foundation), extracted from the
 * near-identical copies in the settings modal and the live-control panel so
 * every toggle in the app gets the same accessible `switch` semantics and
 * focus/disabled states.
 */
export function Toggle({ checked, onChange, ariaLabel, disabled }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent focus-visible:ring-offset-2 focus-visible:ring-offset-deck-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-deck-accent' : 'border border-deck-border bg-deck-card'
      )}
    >
      <span
        className={cx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}
