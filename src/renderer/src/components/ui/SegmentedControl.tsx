import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from '../../lib/ui/classNames'
import { getNextSegmentIndex, isSegmentedNavKey } from '../../lib/ui/segmentedControlNav'

export interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (next: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  /** Optional predicate marking individual options as disabled/unselectable. */
  isOptionDisabled?: (option: T) => boolean
}

/**
 * Shared segmented control (#32 design-system foundation) — a `radiogroup` of
 * mutually-exclusive options rendered as adjoining buttons, extracted from
 * the settings modal's theme/font-size pickers so any surface needing a
 * small exclusive choice (not enough options to justify a full menu) gets
 * the same accessible semantics and visual states for free.
 *
 * Implements the ARIA `radiogroup` roving-tabindex keyboard pattern: only the
 * selected option is in the Tab order, and ArrowLeft/ArrowUp,
 * ArrowRight/ArrowDown, Home, and End move both focus and selection between
 * options (wrapping at the ends and skipping any disabled option), matching
 * mouse-click behavior. See {@link getNextSegmentIndex}.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
  ariaLabel,
  size = 'md',
  isOptionDisabled
}: SegmentedControlProps<T>): JSX.Element {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(options.indexOf(value), 0)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isSegmentedNavKey(event.key)) return
    event.preventDefault()

    const nextIndex = getNextSegmentIndex(
      event.key,
      selectedIndex,
      options.length,
      (index) => isOptionDisabled?.(options[index]) ?? false
    )
    if (nextIndex === null || nextIndex === selectedIndex) return

    onChange(options[nextIndex])
    buttonRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-lg border border-deck-border"
    >
      {options.map((opt, index) => {
        const active = opt === value
        const disabled = isOptionDisabled?.(opt) ?? false
        return (
          <button
            key={opt}
            ref={(el) => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt)}
            onKeyDown={handleKeyDown}
            className={cx(
              'transition-colors motion-reduce:transition-none focus-visible:relative focus-visible:z-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
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
