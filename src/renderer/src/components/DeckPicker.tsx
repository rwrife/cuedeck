import { useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { TextField } from './ui/TextField'
import { EmptyState } from './ui/EmptyState'
import { StatusBanner } from './ui/StatusBanner'
import { TrashIcon } from './ui/icons'

/**
 * Library mode content (#33 Studio shell): pick an existing deck or create a
 * new one. The Studio shell's shared `PageHeader` now owns the page
 * title/brand and description (rendered as its subtitle while in Library
 * mode), and Settings lives in the shell's top bar — so this surface only
 * owns deck-collection actions (create, import, open, export, delete).
 */
export function DeckPicker(): JSX.Element {
  const summaries = useDeckStore((s) => s.summaries)
  const openDeck = useDeckStore((s) => s.openDeck)
  const createDeck = useDeckStore((s) => s.createDeck)
  const deleteDeck = useDeckStore((s) => s.deleteDeck)
  const exportDeck = useDeckStore((s) => s.exportDeck)
  const importDeck = useDeckStore((s) => s.importDeck)
  const statusMessage = useDeckStore((s) => s.statusMessage)
  const setStatusMessage = useDeckStore((s) => s.setStatusMessage)
  const [newName, setNewName] = useState('')

  async function handleCreate(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    await createDeck(name)
    setNewName('')
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 p-10">
      <div className="flex gap-2">
        <TextField
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New deck name…"
          aria-label="New deck name"
          className="flex-1 px-4 py-2.5"
        />
        <Button variant="primary" onClick={handleCreate}>
          Create
        </Button>
        <Button variant="secondary" onClick={importDeck} title="Import a deck from a .json file">
          Import…
        </Button>
      </div>

      {statusMessage && (
        <StatusBanner tone="neutral" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </StatusBanner>
      )}

      <div className="flex-1 overflow-auto">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-deck-muted">
          Your Decks
        </h2>
        {summaries.length === 0 ? (
          <EmptyState
            title="No decks yet"
            description="Create your first deck above — decks hold your demo cards and paste-ready snippets."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {summaries.map((s) => (
              <li
                key={s.id}
                className="group flex items-center justify-between rounded-lg border border-deck-border bg-deck-panel px-4 py-3 transition-colors motion-reduce:transition-none hover:border-deck-accent"
              >
                <button className="flex-1 text-left" onClick={() => openDeck(s.id)}>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-deck-muted">
                    {s.cardCount} card{s.cardCount === 1 ? '' : 's'} · updated{' '}
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => exportDeck(s.id)}
                  className="ml-3 opacity-0 group-hover:opacity-100"
                  title="Export deck to a .json file"
                >
                  Export
                </Button>
                <IconButton
                  label={`Delete deck ${s.name}`}
                  icon={<TrashIcon />}
                  size="sm"
                  onClick={() => deleteDeck(s.id)}
                  className="ml-1 opacity-0 hover:!text-deck-danger group-hover:opacity-100"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

