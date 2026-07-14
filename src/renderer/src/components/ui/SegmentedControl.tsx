import { cx } from '../../lib/ui/classNames'

export interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (next: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}

/**
 * Shared segmented control (#32 design-system foundation) — a `radiogroup` of
 * mutually-exclusive options rendered as adjoining buttons, extracted from
 * the settings modal's theme/font-size pickers so any surface needing a
 * small exclusive choice (not enough options to justify a full menu) gets
 * the same accessible semantics and visual states for free.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
  ariaLabel,
  size = 'md'
}: SegmentedControlProps<T>): JSX.Element {
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
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={cx(
              'transition-colors motion-reduce:transition-none focus-visible:relative focus-visible:z-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-deck-accent text-white'
                : 'bg-deck-panel text-deck-muted hover:bg-deck-card hover:text-deck-text'
            )}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}
