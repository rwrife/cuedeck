import { cx } from '../../lib/ui/classNames'

export interface KeyboardHintProps {
  /** One or more key labels, rendered as adjoining `<kbd>` chips (e.g. `['Ctrl', 'K']`). */
  keys: string[]
  className?: string
}

/**
 * Shared keyboard-shortcut hint (#32 design-system foundation): consistent
 * `<kbd>` styling for the shortcut legends scattered across the workspace
 * header, command palette, and footer (previously each inlined their own
 * `rounded bg-deck-card …` chip). Purely presentational — pass the already
 * platform-resolved key labels.
 */
export function KeyboardHint({ keys, className }: KeyboardHintProps): JSX.Element {
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-xs text-deck-muted"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
