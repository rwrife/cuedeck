import { useState } from 'react'
import { useDeckStore } from '../store/deckStore'

/**
 * Landing screen: pick an existing deck or create a new one.
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
      <header>
        <h1 className="text-3xl font-bold tracking-tight">🎬 CueDeck</h1>
        <p className="mt-1 text-deck-muted">
          Your demo cue cards + instant clipboard snippets.
        </p>
      </header>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New deck name…"
          className="flex-1 rounded-lg border border-deck-border bg-deck-panel px-4 py-2.5 outline-none placeholder:text-deck-muted focus:border-deck-accent"
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-deck-accent px-5 py-2.5 font-medium text-white transition hover:bg-deck-accentHover"
        >
          Create
        </button>
        <button
          onClick={importDeck}
          className="rounded-lg border border-deck-border bg-deck-panel px-5 py-2.5 font-medium text-deck-text transition hover:border-deck-accent"
          title="Import a deck from a .json file"
        >
          Import…
        </button>
      </div>

      {statusMessage && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-deck-border bg-deck-panel px-4 py-2.5 text-sm">
          <span className="min-w-0 break-words text-deck-text">{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="shrink-0 rounded px-1.5 text-deck-muted transition hover:text-deck-text"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-deck-muted">
          Your Decks
        </h2>
        {summaries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-deck-border p-8 text-center text-deck-muted">
            No decks yet. Create your first one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summaries.map((s) => (
              <li
                key={s.id}
                className="group flex items-center justify-between rounded-lg border border-deck-border bg-deck-panel px-4 py-3 transition hover:border-deck-accent"
              >
                <button className="flex-1 text-left" onClick={() => openDeck(s.id)}>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-deck-muted">
                    {s.cardCount} card{s.cardCount === 1 ? '' : 's'} · updated{' '}
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => exportDeck(s.id)}
                  className="ml-3 rounded px-2 py-1 text-xs text-deck-muted opacity-0 transition hover:text-deck-accent group-hover:opacity-100"
                  title="Export deck to a .json file"
                >
                  Export
                </button>
                <button
                  onClick={() => deleteDeck(s.id)}
                  className="ml-1 rounded px-2 py-1 text-xs text-deck-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  title="Delete deck"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
