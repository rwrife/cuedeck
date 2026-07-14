import { useMemo, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { OPEN_SETTINGS_EVENT } from './SettingsModal'
import { Button, IconButton, Icon } from '../ui'
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  NEW_DEMO_CHOICES,
  queryLibrary,
  type LibrarySort,
  type NewDemoChoice
} from '@shared/library'

/**
 * The Library (#34): the app's welcoming landing surface. Lists decks with
 * useful metadata, supports search + sorting, offers a guided New Demo flow
 * (blank / starter template / import), teaches the core concepts on first run,
 * and exposes always-visible (non-hover) per-deck actions with confirmation for
 * destructive delete and visible success/error feedback for every action.
 */
export function DeckPicker(): JSX.Element {
  const summaries = useDeckStore((s) => s.summaries)
  const openDeck = useDeckStore((s) => s.openDeck)
  const createDeck = useDeckStore((s) => s.createDeck)
  const deleteDeck = useDeckStore((s) => s.deleteDeck)
  const renameDeck = useDeckStore((s) => s.renameDeck)
  const duplicateDeck = useDeckStore((s) => s.duplicateDeck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const importDeck = useDeckStore((s) => s.importDeck)
  const statusMessage = useDeckStore((s) => s.statusMessage)
  const setStatusMessage = useDeckStore((s) => s.setStatusMessage)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LibrarySort>(DEFAULT_LIBRARY_SORT)
  const [creating, setCreating] = useState(false)

  const visible = useMemo(
    () => queryLibrary(summaries, query, sort),
    [summaries, query, sort]
  )

  const firstRun = summaries.length === 0

  async function handleNewDemo(choice: NewDemoChoice): Promise<void> {
    setCreating(false)
    if (choice === 'import') {
      await importDeck()
      return
    }
    const label = choice === 'template' ? 'Starter Demo' : 'Untitled Demo'
    await createDeck(label, choice)
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Icon name="deck" size={28} label={null} />
            CueDeck
          </h1>
          <p className="mt-1 text-deck-muted">
            Your demo cue cards + instant clipboard snippets.
          </p>
        </div>
        <IconButton
          icon="settings"
          size="lg"
          variant="secondary"
          onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
          title="Settings — theme, font size, and preferences"
          label="Open settings"
        />
      </header>

      {/* Primary actions: guided New Demo + Import. */}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" leadingIcon="deck" onClick={() => setCreating((v) => !v)}>
          New Demo…
        </Button>
        <Button
          variant="secondary"
          size="lg"
          leadingIcon="external"
          onClick={importDeck}
          title="Import a deck from a .cuedeck.json file"
        >
          Import…
        </Button>
      </div>

      {creating && (
        <NewDemoFlow onChoose={handleNewDemo} onCancel={() => setCreating(false)} />
      )}

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded-lg border border-deck-border bg-deck-panel px-4 py-2.5 text-sm"
        >
          <span className="min-w-0 break-words text-deck-text">{statusMessage}</span>
          <IconButton
            icon="close"
            size="sm"
            onClick={() => setStatusMessage(null)}
            label="Dismiss message"
          />
        </div>
      )}

      {firstRun ? (
        <FirstRunEmptyState onStart={() => setCreating(true)} />
      ) : (
        <>
          {/* Search + sort controls. */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search decks</span>
              <Icon
                name="search"
                label={null}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-deck-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search decks…"
                className="w-full rounded-lg border border-deck-border bg-deck-panel py-2.5 pl-9 pr-3 outline-none placeholder:text-deck-muted focus:border-deck-accent"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-deck-muted">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as LibrarySort)}
                className="rounded-lg border border-deck-border bg-deck-panel px-3 py-2.5 text-deck-text outline-none focus:border-deck-accent"
                aria-label="Sort decks"
              >
                {LIBRARY_SORTS.map((o) => (
                  <option key={o.sort} value={o.sort}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex-1 overflow-auto">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-deck-muted">
              Your Decks
            </h2>
            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-deck-border p-8 text-center text-deck-muted">
                No decks match “{query}”.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((s) => (
                  <DeckRow
                    key={s.id}
                    id={s.id}
                    name={s.name}
                    cardCount={s.cardCount}
                    updatedAt={s.updatedAt}
                    onOpen={() => openDeck(s.id)}
                    onRename={(name) => renameDeck(s.id, name)}
                    onDuplicate={() => duplicateDeck(s.id)}
                    onExport={() => exportDeck(s.id)}
                    onDelete={() => deleteDeck(s.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The guided New Demo flow: three explicit choices, each explaining exactly what
 * will happen before the user commits.
 */
function NewDemoFlow(props: {
  onChoose: (choice: NewDemoChoice) => void
  onCancel: () => void
}): JSX.Element {
  return (
    <section
      aria-label="Start a new demo"
      className="rounded-lg border border-deck-border bg-deck-panel p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-deck-muted">
          Start a new demo
        </h2>
        <IconButton icon="close" size="sm" onClick={props.onCancel} label="Cancel" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {NEW_DEMO_CHOICES.map((c) => (
          <button
            key={c.choice}
            onClick={() => props.onChoose(c.choice)}
            className="flex h-full flex-col gap-1 rounded-lg border border-deck-border bg-deck-card p-3 text-left transition hover:border-deck-accent focus:border-deck-accent focus:outline-none"
          >
            <span className="font-medium text-deck-text">{c.label}</span>
            <span className="text-xs text-deck-muted">{c.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** First-run empty state that teaches decks, cards, and snippets. */
function FirstRunEmptyState(props: { onStart: () => void }): JSX.Element {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-deck-border p-8 text-center">
      <Icon name="deck" size={40} label={null} className="text-deck-accent" />
      <h2 className="text-xl font-semibold">Welcome to CueDeck</h2>
      <ul className="mx-auto max-w-md space-y-1 text-left text-sm text-deck-muted">
        <li>
          • A <span className="text-deck-text">deck</span> is one demo script.
        </li>
        <li>
          • Each <span className="text-deck-text">card</span> is a step you read from
          while presenting.
        </li>
        <li>
          • <span className="text-deck-text">Snippets</span> are paste-ready bits of text
          you copy with one click.
        </li>
      </ul>
      <Button size="lg" leadingIcon="deck" onClick={props.onStart}>
        Create your first demo
      </Button>
    </section>
  )
}

/**
 * A single Library row with an always-visible (non-hover) action menu, inline
 * rename, and a confirming delete that restores focus to the row afterwards.
 */
function DeckRow(props: {
  id: string
  name: string
  cardCount: number
  updatedAt: string
  onOpen: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState(props.name)
  const openRef = useRef<HTMLButtonElement>(null)

  function commitRename(): void {
    const name = draft.trim()
    setRenaming(false)
    if (name && name !== props.name) props.onRename(name)
    else setDraft(props.name)
    openRef.current?.focus()
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-deck-border bg-deck-panel px-4 py-3 transition hover:border-deck-accent focus-within:border-deck-accent">
      <div className="flex items-center gap-2">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraft(props.name)
                setRenaming(false)
                openRef.current?.focus()
              }
            }}
            onBlur={commitRename}
            aria-label="Deck name"
            className="flex-1 rounded border border-deck-accent bg-deck-card px-2 py-1 outline-none"
          />
        ) : (
          <button ref={openRef} className="min-w-0 flex-1 text-left" onClick={props.onOpen}>
            <div className="truncate font-medium">{props.name}</div>
            <div className="text-xs text-deck-muted">
              {props.cardCount} card{props.cardCount === 1 ? '' : 's'} · updated{' '}
              {new Date(props.updatedAt).toLocaleString()}
            </div>
          </button>
        )}

        {!renaming && !confirming && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={props.onOpen} title="Open this deck">
              Open
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(props.name)
                setRenaming(true)
              }}
              title="Rename this deck"
            >
              Rename
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={props.onDuplicate}
              title="Duplicate this deck"
            >
              Duplicate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={props.onExport}
              title="Export this deck to a .cuedeck.json file"
            >
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(true)}
              title="Delete this deck"
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label={`Delete ${props.name}?`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-2 text-deck-text">
            <Icon name="warning" label={null} className="text-red-400" />
            Delete “{props.name}”? This cannot be undone.
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setConfirming(false)
                openRef.current?.focus()
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirming(false)
                props.onDelete()
              }}
              autoFocus
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
