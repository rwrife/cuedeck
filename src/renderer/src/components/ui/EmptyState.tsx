import type { ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/**
 * Shared empty-state pattern (#32 design-system foundation): explain the
 * concept and offer one useful next action, rather than a bare "nothing
 * here" message. Used for collection-empty and no-results surfaces.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed border-deck-border p-8 text-center',
        className
      )}
    >
      {icon && (
        <span className="text-deck-muted" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="font-medium text-deck-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-deck-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
