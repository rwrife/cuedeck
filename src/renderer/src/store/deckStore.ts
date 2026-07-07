import { create } from 'zustand'
import type { CueCard, Deck, DeckSummary, Snippet } from '@shared/types'

/** Generate a reasonably-unique id in the renderer (crypto.randomUUID is available). */
function uid(): string {
  return crypto.randomUUID()
}

interface DeckState {
  // Data
  summaries: DeckSummary[]
  deck: Deck | null
  activeCardId: string | null

  // UI status
  loading: boolean
  saving: boolean

  // Deck lifecycle
  refreshSummaries: () => Promise<void>
  openDeck: (id: string) => Promise<void>
  createDeck: (name: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
  closeDeck: () => void

  // Card ops
  addCard: () => void
  updateCard: (cardId: string, patch: Partial<Omit<CueCard, 'id'>>) => void
  removeCard: (cardId: string) => void
  setActiveCard: (cardId: string) => void

  // Snippet ops
  addSnippet: (cardId: string) => void
  updateSnippet: (cardId: string, snippetId: string, patch: Partial<Omit<Snippet, 'id'>>) => void
  removeSnippet: (cardId: string, snippetId: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

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

    refreshSummaries: async () => {
      const summaries = await window.cuedeck.decks.list()
      set({ summaries })
    },

    openDeck: async (id) => {
      set({ loading: true })
      const deck = await window.cuedeck.decks.load(id)
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
      }))
  }
})
