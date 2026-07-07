import { create } from 'zustand'
import type { CueCard, Deck, DeckSummary, Snippet } from '@shared/types'
import { nextCardId } from '@shared/hotkeys'
import { generateId, normalizeDeck, validateDeck } from '@shared/deck'
import { move } from '@shared/reorder'

/**
 * Generate a reasonably-unique id in the renderer. Delegates to the shared
 * `generateId` so ids are produced identically in the renderer, main, and CLI.
 */
function uid(): string {
  return generateId()
}

interface DeckState {
  // Data
  summaries: DeckSummary[]
  deck: Deck | null
  activeCardId: string | null

  // UI status
  loading: boolean
  saving: boolean
  /**
   * Id of the snippet most recently copied, used to flash "Copied ✓" on the
   * targeted `SnippetButton` when a copy is triggered externally (e.g. via the
   * number-key hotkeys). Cleared back to null after the flash window.
   */
  lastCopiedSnippetId: string | null
  /** Transient message surfaced to the user (import/export errors or confirmations). */
  statusMessage: string | null

  // Deck lifecycle
  refreshSummaries: () => Promise<void>
  openDeck: (id: string) => Promise<void>
  createDeck: (name: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
  closeDeck: () => void

  // Import / export
  exportDeck: (id: string) => Promise<void>
  importDeck: () => Promise<void>
  setStatusMessage: (message: string | null) => void

  // Card ops
  addCard: () => void
  updateCard: (cardId: string, patch: Partial<Omit<CueCard, 'id'>>) => void
  removeCard: (cardId: string) => void
  setActiveCard: (cardId: string) => void
  /** Move the active card by a step in the running order (-1 prev, +1 next). */
  stepActiveCard: (step: -1 | 1) => void
  /** Move a card from one position to another in the running order. */
  reorderCards: (fromIndex: number, toIndex: number) => void

  // Clipboard
  /**
   * Copy a snippet's content to the clipboard and flash it. Safe to call from
   * anywhere (hotkeys, palette, the button itself); it looks the snippet up so
   * callers only need ids.
   */
  copySnippet: (cardId: string, snippetId: string) => Promise<void>
  /** Clear the copied-flash marker (called by the flash timeout). */
  clearLastCopied: (snippetId: string) => void

  // Snippet ops
  addSnippet: (cardId: string) => void
  updateSnippet: (cardId: string, snippetId: string, patch: Partial<Omit<Snippet, 'id'>>) => void
  removeSnippet: (cardId: string, snippetId: string) => void
  /** Move a snippet within a card from one position to another. */
  reorderSnippets: (cardId: string, fromIndex: number, toIndex: number) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let copyFlashTimer: ReturnType<typeof setTimeout> | null = null

/** Duration of the "Copied ✓" flash, in ms. Shared by button + hotkeys. */
export const COPY_FLASH_MS = 1200

export const useDeckStore = create<DeckState>((set, get) => {
  /** Debounced persistence — called after any mutation. */
  function scheduleSave(): void {
    const { deck } = get()
    if (!deck) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const current = get().deck
      if (!current) return
      set({ saving: true })
      const saved = await window.cuedeck.decks.save(current)
      set({ saving: false, deck: { ...current, updatedAt: saved.updatedAt } })
    }, 500)
  }

  /** Apply a mutation to the active deck, then schedule a save. */
  function mutate(fn: (deck: Deck) => Deck): void {
    const { deck } = get()
    if (!deck) return
    set({ deck: fn(deck) })
    scheduleSave()
  }

  return {
    summaries: [],
    deck: null,
    activeCardId: null,
    loading: false,
    saving: false,
    lastCopiedSnippetId: null,
    statusMessage: null,

    refreshSummaries: async () => {
      const summaries = await window.cuedeck.decks.list()
      set({ summaries })
    },

    openDeck: async (id) => {
      set({ loading: true })
      const loaded = await window.cuedeck.decks.load(id)
      // Route the loaded deck through the shared validator/normalizer. Valid
      // decks pass through unchanged; a loose deck is repaired rather than
      // rendering a broken shape. `null` (missing/unreadable) stays `null`.
      const deck = loaded ? (validateDeck(loaded).ok ? loaded : normalizeDeck(loaded)) : null
      set({
        deck,
        loading: false,
        activeCardId: deck?.cards[0]?.id ?? null
      })
    },

    createDeck: async (name) => {
      const deck = await window.cuedeck.decks.create(name)
      await get().refreshSummaries()
      set({ deck, activeCardId: null })
    },

    deleteDeck: async (id) => {
      await window.cuedeck.decks.remove(id)
      const { deck } = get()
      if (deck?.id === id) set({ deck: null, activeCardId: null })
      await get().refreshSummaries()
    },

    closeDeck: () => set({ deck: null, activeCardId: null }),

    exportDeck: async (id) => {
      const result = await window.cuedeck.decks.export(id)
      if (result.error) {
        set({ statusMessage: `Export failed: ${result.error}` })
      } else if (result.ok && result.filePath) {
        set({ statusMessage: `Exported to ${result.filePath}` })
      }
      // Silent no-op when the user simply cancelled the dialog.
    },

    importDeck: async () => {
      const result = await window.cuedeck.decks.import()
      if (result.error) {
        set({ statusMessage: `Import failed: ${result.error}` })
        return
      }
      if (result.ok && result.summary) {
        await get().refreshSummaries()
        set({ statusMessage: `Imported “${result.summary.name}”.` })
      }
      // Silent no-op when the user cancelled the dialog.
    },

    setStatusMessage: (message) => set({ statusMessage: message }),

    addCard: () => {
      const card: CueCard = { id: uid(), title: 'New Card', notes: '', snippets: [] }
      mutate((d) => ({ ...d, cards: [...d.cards, card] }))
      set({ activeCardId: card.id })
    },

    updateCard: (cardId, patch) =>
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c))
      })),

    removeCard: (cardId) => {
      const { deck, activeCardId } = get()
      mutate((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }))
      if (activeCardId === cardId && deck) {
        const remaining = deck.cards.filter((c) => c.id !== cardId)
        set({ activeCardId: remaining[0]?.id ?? null })
      }
    },

    setActiveCard: (cardId) => set({ activeCardId: cardId }),

    stepActiveCard: (step) => {
      const { deck, activeCardId } = get()
      if (!deck) return
      const next = nextCardId(activeCardId, deck.cards, step)
      if (next && next !== activeCardId) set({ activeCardId: next })
    },

    reorderCards: (fromIndex, toIndex) =>
      mutate((d) => {
        const cards = move(d.cards, fromIndex, toIndex)
        return cards === d.cards ? d : { ...d, cards }
      }),

    copySnippet: async (cardId, snippetId) => {
      const { deck } = get()
      const snippet = deck?.cards
        .find((c) => c.id === cardId)
        ?.snippets.find((s) => s.id === snippetId)
      if (!snippet) return

      await window.cuedeck.clipboard.write(snippet.content)

      // Retrigger the flash even if the same snippet is copied twice in a row.
      set({ lastCopiedSnippetId: null })
      set({ lastCopiedSnippetId: snippetId })
      if (copyFlashTimer) clearTimeout(copyFlashTimer)
      copyFlashTimer = setTimeout(() => {
        if (get().lastCopiedSnippetId === snippetId) set({ lastCopiedSnippetId: null })
      }, COPY_FLASH_MS)
    },

    clearLastCopied: (snippetId) => {
      if (get().lastCopiedSnippetId === snippetId) set({ lastCopiedSnippetId: null })
    },

    addSnippet: (cardId) => {
      const snippet: Snippet = { id: uid(), label: 'New Snippet', content: '' }
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) =>
          c.id === cardId ? { ...c, snippets: [...c.snippets, snippet] } : c
        )
      }))
    },

    updateSnippet: (cardId, snippetId, patch) =>
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) =>
          c.id === cardId
            ? {
                ...c,
                snippets: c.snippets.map((s) => (s.id === snippetId ? { ...s, ...patch } : s))
              }
            : c
        )
      })),

    removeSnippet: (cardId, snippetId) =>
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) =>
          c.id === cardId
            ? { ...c, snippets: c.snippets.filter((s) => s.id !== snippetId) }
            : c
        )
      })),

    reorderSnippets: (cardId, fromIndex, toIndex) =>
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) => {
          if (c.id !== cardId) return c
          const snippets = move(c.snippets, fromIndex, toIndex)
          return snippets === c.snippets ? c : { ...c, snippets }
        })
      }))
  }
})
