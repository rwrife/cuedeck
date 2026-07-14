import type { ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'

export interface PageHeaderProps {
  /** Current page/mode title (e.g. the deck name, or "Library"). */
  title: ReactNode
  /**
   * Optional one-line description shown under the title (e.g. Library's
   * "Your demo cue cards + instant clipboard snippets."). Only meaningful
   * while there's no deck-specific status to show instead.
   */
  subtitle?: ReactNode
  /** Small status text shown beside the title (e.g. "Saving…" / "Saved"). */
  status?: ReactNode
  /**
   * Secondary/contextual actions (Search, Export, Live Control, Pin, Close…).
   * Kept visually lighter than `primaryAction` so advanced/infrequent actions
   * never compete with the one primary next step (#33 Studio Shell IA).
   */
  secondaryActions?: ReactNode
  /** The one visually dominant action for the current mode (e.g. "Rehearse"). */
  primaryAction?: ReactNode
  className?: string
}

/**
 * Shared page header / primary-action area (#32 design-system foundation,
 * wired up by #33's Studio shell).
 *
 * Every Studio mode renders through this one header so the current context
 * (title + save status) and the single most relevant next action are always
 * in the same place, while less-common actions stay secondary rather than
 * competing for attention.
 */
export function PageHeader({
  title,
  subtitle,
  status,
  secondaryActions,
  primaryAction,
  className
}: PageHeaderProps): JSX.Element {
  return (
    <header
      className={cx(
        'flex flex-wrap items-center justify-between gap-3 border-b border-deck-border bg-deck-panel px-4 py-2.5',
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {status && <span className="shrink-0 text-xs text-deck-muted">{status}</span>}
        </div>
        {subtitle && <p className="truncate text-xs text-deck-muted">{subtitle}</p>}
      </div>
      {(secondaryActions || primaryAction) && (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </header>
  )
}
