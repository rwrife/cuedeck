import { useState } from 'react'
import { cx } from '../lib/ui/classNames'
import { ChevronDownIcon, ChevronRightIcon, HelpIcon } from './ui/icons'

/**
 * Small, contextual "how do I format this" disclosure for the talking-points
 * Markdown editor (#35 guided Build workspace).
 *
 * Kept inline next to the Write/Preview toggle — rather than in a global
 * settings surface — so the syntax cheat sheet appears exactly where it's
 * useful, and stays entirely out of the way (a single collapsed line) for
 * anyone who already knows Markdown or hasn't needed it yet.
 */
export function MarkdownHelp({ className }: { className?: string }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className={cx('text-xs', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-deck-muted transition hover:text-deck-text"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <HelpIcon />
        Formatting help
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 rounded-lg border border-deck-border bg-deck-panel p-2 leading-relaxed text-deck-muted">
          <p>
            <code className="rounded bg-deck-card px-1 font-mono">**bold**</code>{' '}
            <code className="rounded bg-deck-card px-1 font-mono">*italic*</code>{' '}
            <code className="rounded bg-deck-card px-1 font-mono">`code`</code>
          </p>
          <p>
            <code className="rounded bg-deck-card px-1 font-mono"># Heading</code>{' '}
            <code className="rounded bg-deck-card px-1 font-mono">- list item</code>{' '}
            <code className="rounded bg-deck-card px-1 font-mono">- [ ] task</code>
          </p>
        </div>
      )}
    </div>
  )
}
