import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { isTypingTarget } from '@shared/hotkeys'
import { kindLabel, searchDeck, type SearchResult } from '@shared/search'
import { SearchIcon } from './ui/icons'

/**
 * Custom DOM event other components can dispatch to open the palette (e.g. a
 * visible "Search" button in the workspace header). Using a named event keeps
 * the palette self-contained — callers don't need a ref or lifted state, and we
 * avoid faking synthetic keystrokes.
 */
export const OPEN_COMMAND_PALETTE_EVENT = 'cuedeck:open-command-palette'

/**
 * Command palette / quick-search overlay (#4).
 *
 * Opened by `/` (when not typing in a field) or `Ctrl/Cmd+K`, it fuzzy-searches
 * every card title, card note, and snippet label/content in the open deck.
 * Selecting a **card** result activates that card; selecting a **snippet**
 * result copies it to the clipboard (reusing the store's copy + "Copied ✓"
 * flash) and closes.
 *
 * The component is fully keyboard-operable: type to filter, ↑/↓ to move the
 * selection, Enter to act, Esc (or clicking the backdrop) to close. It owns its
 * own open/close state and a single global keydown listener for the triggers;
 * the ranking logic lives in the DOM-free `@shared/search` module so it can be
 * unit-tested.
 */
export function CommandPalette(): JSX.Element | null {
  const deck = useDeckStore((s) => s.deck)
  const setActiveCard = useDeckStore((s) => s.setActiveCard)
  const copySnippet = useDeckStore((s) => s.copySnippet)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const results = useMemo(() => searchDeck(deck, query), [deck, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelected(0)
  }, [])

  // Global trigger: `/` (unless typing) or Ctrl/Cmd+K opens the palette. A
  // programmatic open (from the header button) arrives via a custom event.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Ctrl/Cmd+K — always available, even while typing in a field.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }

      // `/` — only when the deck is open and the user isn't typing somewhere.
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e.target as HTMLElement | null)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }

    function onOpenRequest(): void {
      setOpen(true)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest)
    }
  }, [])

  // Focus the input each time the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the selected index in range as the result set changes.
  useEffect(() => {
    setSelected((s) => {
      if (results.length === 0) return 0
      return Math.min(s, results.length - 1)
    })
  }, [results])

  // Scroll the selected row into view during keyboard navigation.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, open])

  const activate = useCallback(
    (result: SearchResult | undefined): void => {
      if (!result) return
      if (result.kind === 'card') {
        setActiveCard(result.cardId)
      } else if (result.snippetId) {
        void copySnippet(result.cardId, result.snippetId)
      }
      close()
    },
    [setActiveCard, copySnippet, close]
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        setSelected((s) => (results.length === 0 ? 0 : (s + 1) % results.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelected((s) => (results.length === 0 ? 0 : (s - 1 + results.length) % results.length))
        break
      case 'Enter':
        e.preventDefault()
        activate(results[selected])
        break
      default:
        break
    }
  }

  if (!open || !deck) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={close}
      role="presentation"
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-deck-border bg-deck-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search deck"
      >
        {/* Search field */}
        <div className="flex items-center gap-2 border-b border-deck-border px-3 py-2.5">
          <span className="text-deck-muted" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a card or copy a snippet…"
            className="flex-1 bg-transparent text-sm text-deck-text outline-none placeholder:text-deck-muted"
            aria-label="Search cards and snippets"
            aria-controls="command-palette-results"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-xs text-deck-muted">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-deck-muted">
            {deck.cards.length === 0 ? 'This deck has no cards yet.' : 'No matches.'}
          </p>
        ) : (
          <ul
            ref={listRef}
            id="command-palette-results"
            className="min-h-0 flex-1 overflow-auto py-1"
            role="listbox"
          >
            {results.map((r, i) => {
              const isSelected = i === selected
              return (
                <li key={r.key} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    data-selected={isSelected}
                    onMouseMove={() => setSelected(i)}
                    onClick={() => activate(r)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                      isSelected ? 'bg-deck-accent text-white' : 'text-deck-text hover:bg-deck-card'
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : r.kind === 'card'
                            ? 'bg-deck-border text-deck-muted'
                            : 'bg-deck-accent/20 text-deck-accentHover'
                      }`}
                    >
                      {kindLabel(r.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      {r.subtitle && (
                        <span
                          className={`block truncate text-xs ${
                            isSelected ? 'text-white/70' : 'text-deck-muted'
                          }`}
                        >
                          {r.subtitle}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${
                        isSelected ? 'text-white/80' : 'text-deck-muted'
                      }`}
                    >
                      {r.kind === 'card' ? 'Go ↵' : 'Copy ↵'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Footer legend */}
        <div className="flex items-center gap-2 border-t border-deck-border px-3 py-1.5 text-xs text-deck-muted">
          <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">↑</kbd>
          <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">↓</kbd>
          <span>navigate</span>
          <span className="text-deck-border">·</span>
          <kbd className="rounded bg-deck-card px-1.5 py-0.5 font-mono">↵</kbd>
          <span>go / copy</span>
          <span className="ml-auto text-deck-border">·</span>
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}
