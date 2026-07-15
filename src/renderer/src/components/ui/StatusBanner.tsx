import type { ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { toneClasses, type Tone } from '../../lib/ui/variants'
import { IconButton } from './IconButton'
import { CheckIcon, CloseIcon, WarningIcon } from './icons'

export interface StatusBannerProps {
  tone: Tone
  children: ReactNode
  onDismiss?: () => void
  className?: string
  /**
   * When true, announce as an assertive `role="alert"` region rather than the
   * default polite `role="status"`. Use for failures the user must notice
   * immediately (e.g. a failed save), not for routine confirmations.
   */
  assertive?: boolean
}

const TONE_ICON: Partial<Record<Tone, ReactNode>> = {
  success: <CheckIcon />,
  warning: <WarningIcon />,
  danger: <WarningIcon />
}

/**
 * Shared status/feedback banner (#32 design-system foundation): a consistent
 * success/warning/danger/info/neutral surface for save state, import/export
 * results, and other feedback that must be visible where the action
 * happened (rather than color-only — each tone also gets a distinct icon).
 * Defaults to `role="status"` + `aria-live="polite"` so screen readers announce
 * changes without stealing focus; pass `assertive` for urgent failures that
 * should interrupt as `role="alert"` + `aria-live="assertive"` (#38).
 */
export function StatusBanner({
  tone,
  children,
  onDismiss,
  className,
  assertive = false
}: StatusBannerProps): JSX.Element {
  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={cx(
        'flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm',
        toneClasses(tone),
        className
      )}
    >
      <span className="flex min-w-0 items-start gap-2 break-words">
        {TONE_ICON[tone] && <span className="mt-0.5 shrink-0">{TONE_ICON[tone]}</span>}
        <span className="min-w-0 break-words">{children}</span>
      </span>
      {onDismiss && (
        <IconButton
          label="Dismiss"
          icon={<CloseIcon />}
          size="sm"
          onClick={onDismiss}
          className="shrink-0"
          hideTooltip
        />
      )}
    </div>
  )
}
