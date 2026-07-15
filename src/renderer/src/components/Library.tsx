import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DeckSummary } from '@shared/types'
import {
  LIBRARY_SORT_KEYS,
  filterDecksByQuery,
  librarySortLabel,
  sortDecks,
  validateDeckName,
  type LibrarySortKey
} from '@shared/library'
import { useDeckStore } from '../store/deckStore'
import { Button } from './ui/Button'
import { TextField } from './ui/TextField'
import { SegmentedControl } from './ui/SegmentedControl'
import { EmptyState } from './ui/EmptyState'
import { StatusBanner } from './ui/StatusBanner'
import { Dialog } from './ui/Dialog'
import { Menu, type MenuItem } from './ui/Menu'
import {
  ClapperboardIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  FileIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
  UploadIcon
} from './ui/icons'

/**
 * Guided "New Demo" flow (#34): three explicit, equally-visible choices
 * instead of a single bare name field. Blank and Starter template both need a
 * name up front; Import delegates straight to the native file picker (whose
 * cancellation is already a neutral no-op — see `importDeck`).
 */
function NewDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const createBlankDemo = useDeckStore((s) => s.createBlankDemo)
  const createFromTemplate = useDeckStore((s) => s.createFromTemplate)
  const importDeck = useDeckStore((s) => s.importDeck)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setNameError(null)
    }
  }, [open])

  function withValidName(run: (name: string) => void): void {
    const result = validateDeckName(name)
    if (!result.ok) {
      setNameError(result.error)
      return
    }
    run(result.name)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="new-demo-title">
      <header className="border-b border-deck-border px-5 py-3.5">
        <h2 id="new-demo-title" className="text-lg font-semibold text-deck-text">
          New Demo
        </h2>
        <p className="mt-0.5 text-xs text-deck-muted">Choose how you&rsquo;d like to start.</p>
      </header>

      <div className="px-5 py-4">
        <label htmlFor="new-demo-name" className="mb-1 block text-xs font-medium text-deck-muted">
          Demo name
        </label>
        <TextField
          id="new-demo-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (nameError) setNameError(null)
          }}
          placeholder="e.g. Acme kickoff demo"
          invalid={Boolean(nameError)}
          autoFocus
          className="w-full"
        />
        {nameError && <p className="mt-1 text-xs text-deck-warning">{nameError}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <NewDemoChoice
            icon={<FileIcon />}
            title="Blank demo"
            description="Start empty, with one focused first step to fill in."
            onSelect={() => withValidName((n) => void createBlankDemo(n))}
          />
          <NewDemoChoice
            icon={<SparklesIcon />}
            title="Starter template"
            description="A short 3-step sample deck to learn the model."
            onSelect={() => withValidName((n) => void createFromTemplate(n))}
          />
          <NewDemoChoice
            icon={<UploadIcon />}
            title="Import a deck…"
            description="Bring in an existing deck exported to a .json file."
            onSelect={() => {
              onClose()
              void importDeck()
            }}
          />
        </div>
      </div>

      <footer className="flex justify-end border-t border-deck-border px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </footer>
    </Dialog>
  )
}

function NewDemoChoice({
  icon,
  title,
  description,
  onSelect
}: {
  icon: ReactNode
  title: string
  description: string
  onSelect: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-start gap-3 rounded-lg border border-deck-border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none hover:border-deck-accent hover:bg-deck-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent"
    >
      <span className="mt-0.5 shrink-0 text-deck-muted" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-deck-text">{title}</span>
        <span className="block text-xs text-deck-muted">{description}</span>
      </span>
    </button>
  )
}

/** Rename confirmation (#34): a simple named Dialog, matching Delete's pattern. */
function RenameDialog({
  deck,
  onCancel,
  onConfirm
}: {
  deck: DeckSummary | null
  onCancel: () => void
  onConfirm: (name: string) => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (deck) {
      setName(deck.name)
      setError(null)
    }
  }, [deck])

  function submit(): void {
    const result = validateDeckName(name)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onConfirm(result.name)
  }

  return (
    <Dialog open={deck !== null} onClose={onCancel} labelledBy="rename-deck-title">
      <header className="border-b border-deck-border px-5 py-3.5">
        <h2 id="rename-deck-title" className="text-lg font-semibold text-deck-text">
          Rename deck
        </h2>
      </header>
      <div className="px-5 py-4">
        <label htmlFor="rename-deck-name" className="mb-1 block text-xs font-medium text-deck-muted">
          Deck name
        </label>
        <TextField
          id="rename-deck-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          invalid={Boolean(error)}
          autoFocus
          className="w-full"
        />
        {error && <p className="mt-1 text-xs text-deck-warning">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-deck-border px-5 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit}>
          Rename
        </Button>
      </footer>
    </Dialog>
  )
}

/** Delete confirmation (#34): destructive, so it always requires an explicit yes. */
function DeleteConfirmDialog({
  deck,
  onCancel,
  onConfirm
}: {
  deck: DeckSummary | null
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <Dialog open={deck !== null} onClose={onCancel} labelledBy="delete-deck-title">
      <div className="px-5 py-4">
        <h2 id="delete-deck-title" className="text-lg font-semibold text-deck-text">
          Delete “{deck?.name}”?
        </h2>
        <p className="mt-2 text-sm text-deck-muted">
          This can&apos;t be undone — the deck file will be permanently removed.
        </p>
      </div>
      <footer className="flex justify-end gap-2 border-t border-deck-border px-5 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Delete deck
        </Button>
      </footer>
    </Dialog>
  )
}

/**
 * Library mode content (#34): a professional deck collection surface
 * replacing the old hover-dependent `DeckPicker`. The Studio shell's shared
 * `PageHeader` still owns the page title/subtitle — this surface owns the
 * deck collection itself: the guided New Demo flow, search/sort, per-deck
 * metadata, and an accessible deck-level overflow menu (open, rename,
 * duplicate, export, delete), none of which depend on hover.
 */
export function Library(): JSX.Element {
  const summaries = useDeckStore((s) => s.summaries)
  const openDeck = useDeckStore((s) => s.openDeck)
  const renameDeck = useDeckStore((s) => s.renameDeck)
  const duplicateDeck = useDeckStore((s) => s.duplicateDeck)
  const deleteDeck = useDeckStore((s) => s.deleteDeck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const statusMessage = useDeckStore((s) => s.statusMessage)
  const statusTone = useDeckStore((s) => s.statusTone)
  const setStatusMessage = useDeckStore((s) => s.setStatusMessage)

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<LibrarySortKey>('updated')
  const [newDemoOpen, setNewDemoOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<DeckSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeckSummary | null>(null)

  // Stable anchors used for predictable keyboard-focus restoration (#34
  // Accessibility): the "New Demo" button always exists, unlike a just-deleted
  // row's own trigger, and each row's open button is tracked by deck id so a
  // delete can hand focus to the row that takes the deleted one's place.
  const newDemoButtonRef = useRef<HTMLButtonElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const displayed = sortDecks(filterDecksByQuery(summaries, query), sortKey)

  async function handleDeleteConfirm(): Promise<void> {
    const target = deleteTarget
    if (!target) return
    const index = displayed.findIndex((d) => d.id === target.id)
    await deleteDeck(target.id)
    setDeleteTarget(null)
    // Wait a frame so the list has re-rendered without the deleted row before
    // choosing where focus lands — restoring it to whatever now occupies the
    // deleted row's position (or the previous row, or the New Demo button for
    // an empty Library) rather than a removed element.
    requestAnimationFrame(() => {
      const next = sortDecks(filterDecksByQuery(useDeckStore.getState().summaries, query), sortKey)
      const candidate = next[index] ?? next[index - 1]
      const focusTarget = candidate ? rowRefs.current.get(candidate.id) : undefined
      ;(focusTarget ?? newDemoButtonRef.current)?.focus()
    })
  }

  function menuItemsFor(summary: DeckSummary): MenuItem[] {
    return [
      {
        key: 'open',
        label: 'Open',
        onSelect: () => openDeck(summary.id)
      },
      {
        key: 'rename',
        label: 'Rename…',
        icon: <EditIcon />,
        onSelect: () => setRenameTarget(summary)
      },
      {
        key: 'duplicate',
        label: 'Duplicate',
        icon: <CopyIcon />,
        onSelect: () => void duplicateDeck(summary.id)
      },
      {
        key: 'export',
        label: 'Export…',
        icon: <DownloadIcon />,
        onSelect: () => void exportDeck(summary.id)
      },
      {
        key: 'delete',
        label: 'Delete…',
        icon: <TrashIcon />,
        danger: true,
        onSelect: () => setDeleteTarget(summary)
      }
    ]
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-hidden p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-deck-muted">
            <SearchIcon />
          </span>
          <TextField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decks…"
            aria-label="Search decks"
            className="w-full pl-9"
          />
        </div>
        <SegmentedControl
          value={sortKey}
          options={LIBRARY_SORT_KEYS}
          labels={{ updated: librarySortLabel('updated'), name: librarySortLabel('name') }}
          ariaLabel="Sort decks"
          onChange={setSortKey}
        />
        <Button
          ref={newDemoButtonRef}
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => setNewDemoOpen(true)}
        >
          New Demo
        </Button>
      </div>

      {statusMessage && (
        <StatusBanner tone={statusTone} onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </StatusBanner>
      )}

      <div className="flex-1 overflow-auto">
        {summaries.length === 0 ? (
          <EmptyState
            icon={<ClapperboardIcon />}
            title="Your decks live here"
            description={
              <>
                A demo is a <strong>deck</strong>: an ordered set of steps, each with talking
                points and paste-ready snippets you copy live while presenting. Start with a
                blank demo, a starter template, or import an existing deck.
              </>
            }
            action={
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setNewDemoOpen(true)}>
                New Demo
              </Button>
            }
          />
        ) : displayed.length === 0 ? (
          <EmptyState
            title={`No decks match “${query}”.`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {displayed.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-deck-border bg-deck-panel px-4 py-3"
              >
                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.id, el)
                    else rowRefs.current.delete(s.id)
                  }}
                  type="button"
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent"
                  onClick={() => openDeck(s.id)}
                >
                  <div className="truncate font-medium text-deck-text">{s.name}</div>
                  <div className="truncate text-xs text-deck-muted">
                    {s.cardCount} step{s.cardCount === 1 ? '' : 's'} · Updated{' '}
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </button>
                <Menu label={`Actions for ${s.name}`} items={menuItemsFor(s)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewDemoDialog open={newDemoOpen} onClose={() => setNewDemoOpen(false)} />
      <RenameDialog
        deck={renameTarget}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          const target = renameTarget
          setRenameTarget(null)
          if (target) void renameDeck(target.id, name)
        }}
      />
      <DeleteConfirmDialog
        deck={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  )
}
