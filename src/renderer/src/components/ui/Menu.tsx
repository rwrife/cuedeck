import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from '../../lib/ui/classNames'
import { getFocusableElements } from '../../lib/ui/focusTrap'
import { getNextMenuIndex, isMenuNavKey } from '../../lib/ui/menuNav'
import { IconButton } from './IconButton'
import { MoreVerticalIcon } from './icons'

export interface MenuItem {
  /** Stable key, also used to look the item up in tests. */
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Renders in the danger tone (e.g. "Delete deck"). */
  danger?: boolean
  disabled?: boolean
}

export interface MenuProps {
  /** Accessible name for the trigger button (e.g. "Actions for Sprint Demo"). */
  label: string
  items: MenuItem[]
  /** Trigger icon; defaults to a vertical-dots "more actions" glyph. */
  icon?: ReactNode
  className?: string
}

/**
 * Accessible deck-level overflow menu (#34 Library).
 *
 * A lightweight, non-modal popover — not the full-screen `Dialog` — since a
 * menu is a small, transient list of actions anchored to its trigger, not a
 * task that needs a backdrop. Follows the standard disclosure-menu pattern:
 * the trigger toggles a `role="menu"` popover of `role="menuitem"` buttons,
 * ArrowUp/ArrowDown move focus between them, Escape (or selecting an item, or
 * clicking outside) closes it and returns focus to the trigger. Every action
 * is reachable via click AND keyboard — nothing here depends on hover, unlike
 * the deck-picker actions it replaces.
 */
export function Menu({ label, items, icon, className }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  function close(restoreFocus: boolean): void {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  // Focus the first item once the popover opens; close on Escape or an
  // outside click, always giving focus back to the trigger.
  useEffect(() => {
    if (!open) return
    const [first] = getFocusableElements(menuRef.current)
    first?.focus()

    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    }
    function onPointerDown(e: MouseEvent): void {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (!isMenuNavKey(e.key)) return
    e.preventDefault()
    const focusable = getFocusableElements(menuRef.current)
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
    const nextIndex = getNextMenuIndex(e.key, currentIndex, focusable.length)
    if (nextIndex !== null) focusable[nextIndex]?.focus()
  }

  return (
    <div className={cx('relative inline-block', className)}>
      <IconButton
        ref={buttonRef}
        label={label}
        icon={icon ?? <MoreVerticalIcon />}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-40 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-deck-border bg-deck-panel py-1 shadow-2xl"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className={cx(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none',
                'hover:bg-deck-card focus-visible:bg-deck-card focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                item.danger ? 'text-deck-danger' : 'text-deck-text'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
