import { create } from 'zustand'
import type { CueCard, Deck, DeckSummary, Snippet } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '@shared/types'
import { nextCardId } from '@shared/hotkeys'
import {
  type WorkspaceMode,
  modeAfterCloseDeck,
  modeAfterEnterPresent,
  modeAfterExitPresent,
  modeAfterOpenDeck,
  resolveModeSelection
} from '@shared/workspace'
import { generateId, normalizeDeck, validateDeck } from '@shared/deck'
import { renderSnippet, collectReferencedVariables } from '@shared/variables'
import { move } from '@shared/reorder'
import { useSettingsStore } from './settingsStore'
import { playCopyChime } from '../lib/copySound'

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
   * Current Studio mode (#33): `'library'`, `'build'`, `'rehearse'`, or the
   * compact, read-only, always-on-top `'present'` layout used while running a
   * live demo (#5). Library is always available; the other three require an
   * open deck (see `@shared/workspace`).
   */
  workspaceMode: WorkspaceMode
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

  // Presenter mode (#5) / Studio mode navigation (#33)
  /**
   * Guarded mode-rail navigation: switches to `mode` when it's available
   * (Library is always available; Build/Rehearse/Present require an open
   * deck) and is a no-op otherwise. Selecting `'present'` delegates to
   * {@link enterPresent} so the window side effects stay consistent.
   */
  selectWorkspaceMode: (mode: WorkspaceMode) => void
  /**
   * Enter Present: switches to the compact, read-only layout and drives the
   * main-process window side effects (compact size + always-on-top) via
   * `window.cuedeck.window.setPresenter`. A no-op without an open deck.
   */
  enterPresent: () => void
  /**
   * Exit Present back to Rehearse, restoring the prior window bounds and
   * always-on-top state via the same trusted IPC. A no-op when not currently
   * presenting.
   */
  exitPresent: () => void

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
  /**
   * Live-control variant (#17): resolve a snippet's `{{variables}}` and trigger
   * the copy flash/sound exactly like {@link copySnippet}, but WITHOUT writing
   * the clipboard — the main process performs the trusted clipboard write for
   * bridge-driven copies. Returns the resolved text and label, or null when the
   * card/snippet can't be found.
   */
  copySnippetForLive: (
    cardId: string,
    snippetId: string
  ) => { snippetId: string; label: string; copied: string } | null
  /** Clear the copied-flash marker (called by the flash timeout). */
  clearLastCopied: (snippetId: string) => void

  // Snippet ops
  addSnippet: (cardId: string) => void
  updateSnippet: (cardId: string, snippetId: string, patch: Partial<Omit<Snippet, 'id'>>) => void
  removeSnippet: (cardId: string, snippetId: string) => void
  /** Move a snippet within a card from one position to another. */
  reorderSnippets: (cardId: string, fromIndex: number, toIndex: number) => void

  // Deck-level variables (#7)
  /**
   * Set (or clear) a deck variable used for `{{placeholder}}` substitution in
   * snippet content. An empty/whitespace value is kept as a defined-but-empty
   * key so the editor can still surface it as “unfilled”.
   */
  setVariable: (name: string, value: string) => void
  /** Delete a deck variable entirely. */
  removeVariable: (name: string) => void
  /**
   * Rename a variable key, preserving its value. No-op when `to` is blank,
   * unchanged, or already taken (the caller should validate/report). Does not
   * rewrite `{{placeholders}}` in snippet content — renaming is a map-key change.
   */
  renameVariable: (from: string, to: string) => void
  /**
   * Add empty entries for every `{{variable}}` referenced anywhere in the deck
   * that isn't already defined, so the user can fill them from one place.
   * Returns the names that were added.
   */
  addReferencedVariables: () => string[]
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

  /**
   * Trigger the shared copy feedback (the “Copied ✓” flash + optional chime)
   * for a snippet, honoring the live copy-flash/copy-sound preferences. Split
   * out so both the clipboard-writing {@link copySnippet} and the
   * clipboard-less live-control copy path give identical feedback.
   */
  function flashCopied(snippetId: string): void {
    const { copyFlash, copySound } = useSettingsStore.getState().settings

    if (copySound) playCopyChime()

    if (!copyFlash) {
      // Feedback flash disabled: make sure no stale marker lingers and skip
      // scheduling a new one.
      if (copyFlashTimer) clearTimeout(copyFlashTimer)
      if (get().lastCopiedSnippetId !== null) set({ lastCopiedSnippetId: null })
      return
    }

    // Retrigger the flash even if the same snippet is copied twice in a row.
    set({ lastCopiedSnippetId: null })
    set({ lastCopiedSnippetId: snippetId })
    if (copyFlashTimer) clearTimeout(copyFlashTimer)
    copyFlashTimer = setTimeout(() => {
      if (get().lastCopiedSnippetId === snippetId) set({ lastCopiedSnippetId: null })
    }, COPY_FLASH_MS)
  }

  return {
    summaries: [],
    deck: null,
    activeCardId: null,
    loading: false,
    saving: false,
    workspaceMode: 'library',
    lastCopiedSnippetId: null,
    statusMessage: null,

    refreshSummaries: async () => {
      const summaries = await window.cuedeck.decks.list()
      set({ summaries })
    },

    openDeck: async (id) => {
      set({ loading: true })
      const loaded = await window.cuedeck.decks.load(id)
      // Route the loaded deck through the shared validator/normalizer. A deck
      // that is already valid AND at the current schema version passes through
      // unchanged; anything older (e.g. a v1 deck with no `variables`) or loose
      // is migrated/repaired via normalizeDeck so it renders correctly and,
      // once touched, persists in the upgraded shape. `null` stays `null`.
      let deck: Deck | null = null
      if (loaded) {
        const isCurrent = validateDeck(loaded).ok && loaded.schemaVersion === CURRENT_SCHEMA_VERSION
        deck = isCurrent ? loaded : normalizeDeck(loaded)
      }
      set({
        deck,
        loading: false,
        activeCardId: deck?.cards[0]?.id ?? null,
        // Opening a deck moves the Studio from Library to Build (#33); a
        // failed load (deck stays null) leaves the current mode untouched.
        workspaceMode: deck ? modeAfterOpenDeck() : get().workspaceMode
      })
    },

    createDeck: async (name) => {
      const deck = await window.cuedeck.decks.create(name)
      await get().refreshSummaries()
      // Creating a deck moves the Studio from Library to Build (#33).
      set({ deck, activeCardId: null, workspaceMode: modeAfterOpenDeck() })
    },

    deleteDeck: async (id) => {
      await window.cuedeck.decks.remove(id)
      const { deck, workspaceMode } = get()
      if (deck?.id === id) {
        if (workspaceMode === 'present') void window.cuedeck.window.setPresenter(false)
        set({ deck: null, activeCardId: null, workspaceMode: modeAfterCloseDeck() })
      }
      await get().refreshSummaries()
    },

    closeDeck: () => {
      // Leaving a deck always returns to Library; make sure we don't strand
      // the user in a tiny always-on-top presenter window.
      if (get().workspaceMode === 'present') {
        void window.cuedeck.window.setPresenter(false)
      }
      set({ deck: null, activeCardId: null, workspaceMode: modeAfterCloseDeck() })
    },

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

    selectWorkspaceMode: (mode) => {
      if (mode === 'present') {
        get().enterPresent()
        return
      }
      const { workspaceMode, deck } = get()
      const next = resolveModeSelection(mode, workspaceMode, deck !== null)
      if (next !== workspaceMode) set({ workspaceMode: next })
    },

    enterPresent: () => {
      const { workspaceMode, deck } = get()
      const next = modeAfterEnterPresent(workspaceMode, deck !== null)
      if (next === workspaceMode) return
      set({ workspaceMode: next })
      // Fire-and-forget the window side effects; the renderer layout switches
      // immediately regardless of how the OS honors resize/always-on-top.
      void window.cuedeck.window.setPresenter(true)
    },

    exitPresent: () => {
      const { workspaceMode } = get()
      const next = modeAfterExitPresent(workspaceMode)
      if (next === workspaceMode) return
      set({ workspaceMode: next })
      void window.cuedeck.window.setPresenter(false)
    },

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

      // Substitute deck-level `{{variables}}` before the text hits the
      // clipboard (#7). Missing variables are rendered as a visible marker by
      // renderSnippet rather than shipping a raw `{{token}}`.
      const rendered = renderSnippet(snippet.content, deck?.variables)
      await window.cuedeck.clipboard.write(rendered)

      // Copy-feedback preferences (#8): flash + sound are independently
      // toggleable and shared with the live-control copy path.
      flashCopied(snippetId)
    },

    copySnippetForLive: (cardId, snippetId) => {
      const { deck } = get()
      const snippet = deck?.cards
        .find((c) => c.id === cardId)
        ?.snippets.find((s) => s.id === snippetId)
      if (!snippet) return null
      // Same `{{variable}}` substitution as the normal copy path; the main
      // process performs the actual clipboard write for bridge-driven copies.
      const copied = renderSnippet(snippet.content, deck?.variables)
      flashCopied(snippetId)
      return { snippetId: snippet.id, label: snippet.label, copied }
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
          c.id === cardId ? { ...c, snippets: c.snippets.filter((s) => s.id !== snippetId) } : c
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
      })),

    setVariable: (name, value) => {
      const key = name.trim()
      if (!key) return
      mutate((d) => ({ ...d, variables: { ...(d.variables ?? {}), [key]: value } }))
    },

    removeVariable: (name) =>
      mutate((d) => {
        const current = d.variables ?? {}
        if (!(name in current)) return d
        const next = { ...current }
        delete next[name]
        return { ...d, variables: next }
      }),

    renameVariable: (from, to) => {
      const target = to.trim()
      mutate((d) => {
        const current = d.variables ?? {}
        if (!target || target === from || !(from in current) || target in current) return d
        // Rebuild preserving key order: swap the renamed key in place.
        const next: Record<string, string> = {}
        for (const [k, v] of Object.entries(current)) {
          if (k === from) next[target] = v
          else next[k] = v
        }
        return { ...d, variables: next }
      })
    },

    addReferencedVariables: () => {
      const { deck } = get()
      if (!deck) return []
      const referenced = collectReferencedVariables(
        deck.cards.flatMap((c) => c.snippets.map((s) => s.content))
      )
      const current = deck.variables ?? {}
      const added = referenced.filter((name) => !(name in current))
      if (added.length === 0) return []
      mutate((d) => {
        const vars = { ...(d.variables ?? {}) }
        for (const name of added) vars[name] = ''
        return { ...d, variables: vars }
      })
      return added
    }
  }
})
