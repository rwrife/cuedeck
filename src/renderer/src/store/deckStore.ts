import { create } from 'zustand'
import type { CueCard, Deck, DeckSummary, Snippet } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '@shared/types'
import { nextCardId } from '@shared/hotkeys'
import { type DeckMode, toggleMode as flipMode } from '@shared/presenter'
import {
  type WorkspaceMode,
  canEnterMode,
  modeAfterCloseDeck,
  modeAfterExitPresent,
  modeAfterOpenDeck,
  resolveModeRequest,
  windowModeFor
} from '@shared/workspace'
import type { ReadinessFix } from '@shared/readiness'
import { generateId, normalizeDeck, validateDeck } from '@shared/deck'
import type { NewDemoChoice } from '@shared/library'
import { renderSnippet, collectReferencedVariables } from '@shared/variables'
import {
  type SaveState,
  initialSaveState,
  markDirty,
  markError,
  markSaved,
  markSaving,
  needsFlush
} from '@shared/saveStatus'
import { move } from '@shared/reorder'
import { BUILD_LANGUAGE } from '@shared/buildLanguage'
import { useSettingsStore } from './settingsStore'
import { playCopyChime } from '../lib/copySound'

/**
 * Generate a reasonably-unique id in the renderer. Delegates to the shared
 * `generateId` so ids are produced identically in the renderer, main, and CLI.
 */
function uid(): string {
  return generateId()
}

/**
 * A one-shot request to move keyboard focus to a just-created field (#35), so
 * newly added steps and paste-ready content are immediately ready for typing.
 * The owning component consumes it (focuses the matching field) and then calls
 * {@link DeckState.clearFocusRequest}. DOM-free so the transition is testable.
 */
export interface FocusRequest {
  /** `step-title` targets a step's title input; `content-label` a block label. */
  kind: 'step-title' | 'content-label'
  /** The card id (for `step-title`) or snippet id (for `content-label`). */
  id: string
}

interface DeckState {
  // Data
  summaries: DeckSummary[]
  deck: Deck | null
  activeCardId: string | null
  /**
   * Pending autofocus request for a newly created step or paste-ready content
   * block (#35). Null when there is nothing to focus.
   */
  focusRequest: FocusRequest | null

  // UI status
  loading: boolean
  /**
   * Visible persistence status (#38). Replaces the old boolean `saving` so a
   * failed write can never be presented as “Saved”, and so the shell can warn
   * about unsaved changes. Driven by the pure state machine in
   * `@shared/saveStatus`.
   */
  saveState: SaveState
  /**
   * Current workspace layout. `'edit'` is the full authoring workspace;
   * `'present'` is the compact, read-only, always-on-top Presenter Mode used
   * while running a live demo (#5).
   */
  mode: DeckMode
  /**
   * Active Studio workspace mode (#33): `library`, `build`, `rehearse`, or
   * `present`. `library` is always available; the deck-specific modes are only
   * reachable while a deck is open. This drives the Studio shell navigation,
   * while {@link DeckState.mode} continues to drive the compact presenter
   * window layout (and stays derived from the workspace mode).
   */
  workspace: WorkspaceMode
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
  createDeck: (name: string, template?: NewDemoChoice) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
  /** Rename a deck by id, surfacing visible success/error feedback (#34). */
  renameDeck: (id: string, name: string) => Promise<void>
  /**
   * Duplicate a deck by id. The new copy appears in the Library with visible
   * feedback; the original is untouched (#34).
   */
  duplicateDeck: (id: string) => Promise<void>
  closeDeck: () => void

  // Import / export
  exportDeck: (id: string) => Promise<void>
  importDeck: () => Promise<void>
  setStatusMessage: (message: string | null) => void

  /**
   * Immediately persist any pending edits, bypassing the debounce (#38). Called
   * before closing a deck, entering Present, or shutting the app down so the
   * last keystroke is never lost. Resolves once the write settles (success or
   * failure); the resulting {@link DeckState.saveState} reflects the outcome.
   */
  flushSave: () => Promise<void>

  // Presenter mode (#5)
  /**
   * Switch between edit and presenter layouts. Also drives the main-process
   * window side effects (compact size + always-on-top on enter; restore on
   * exit) via `window.cuedeck.window.setPresenter`.
   */
  setMode: (mode: DeckMode) => void
  /** Convenience toggle between edit and presenter modes. */
  toggleMode: () => void

  // Studio shell navigation (#33)
  /**
   * Request a workspace mode. Deck-specific modes are ignored when no deck is
   * open (the shell stays in the Library). Entering/leaving `present` drives
   * the presenter window side effects, exactly as {@link DeckState.setMode}.
   */
  setWorkspace: (mode: WorkspaceMode) => void
  /**
   * Exit the Present workspace back to Rehearse, restoring the prior window
   * bounds and always-on-top state via the presenter window IPC.
   */
  exitPresent: () => void

  /**
   * Enter the Present workspace directly from Rehearse (#36). A thin wrapper
   * over {@link DeckState.setWorkspace}('present') so the Rehearse preflight can
   * expose a single, clear "Start Presenting" action that works even when the
   * deck has readiness warnings (warnings inform, they do not block).
   */
  startPresenting: () => void

  /**
   * Navigate to the exact Build location that resolves a readiness warning
   * (#36): switch to the Build workspace and either focus the offending step or
   * open the deck variables and focus the named variable. Never mutates the
   * deck — it only moves the user to where they can fix the concern.
   */
  focusBuildTarget: (fix: ReadinessFix) => void

  /** Clear a consumed autofocus request (#35). */
  clearFocusRequest: () => void

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

/**
 * DOM event dispatched by {@link DeckState.focusBuildTarget} when a readiness
 * warning links to a deck variable (#36). The Build editor listens for it to
 * open the advanced-tools disclosure and focus the named variable value.
 */
export const REVEAL_VARIABLE_EVENT = 'cuedeck:reveal-variable'

export const useDeckStore = create<DeckState>((set, get) => {
  /**
   * Perform an actual persistence write for the active deck, driving the save
   * state machine (#38). Any rejection is caught and surfaced as an `error`
   * state so a failed write is never reported as saved. Tracks whether new
   * edits arrived mid-flight so a trailing keystroke stays “unsaved”.
   */
  async function performSave(): Promise<void> {
    const current = get().deck
    if (!current) return
    set({ saveState: markSaving() })
    const savedUpdatedAt = current.updatedAt
    try {
      const saved = await window.cuedeck.decks.save(current)
      const latest = get().deck
      // A concurrent edit replaced/mutated the deck while we were writing.
      const stillDirty = latest !== current && latest?.updatedAt === savedUpdatedAt
      if (latest && latest.id === current.id) {
        set({
          deck: { ...latest, updatedAt: saved.updatedAt },
          saveState: markSaved(stillDirty)
        })
      } else {
        set({ saveState: markSaved(false) })
      }
    } catch (err) {
      set({
        saveState: markError((err as Error)?.message ?? 'Save failed.'),
        statusMessage: `Couldn’t save your changes: ${(err as Error)?.message ?? 'unknown error'}`
      })
    }
  }

  /** Debounced persistence — called after any mutation. */
  function scheduleSave(): void {
    const { deck } = get()
    if (!deck) return
    set({ saveState: markDirty() })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void performSave()
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
    focusRequest: null,
    loading: false,
    saveState: initialSaveState,
    mode: 'edit',
    workspace: 'library',
    lastCopiedSnippetId: null,
    statusMessage: null,

    refreshSummaries: async () => {
      const summaries = await window.cuedeck.decks.list()
      set({ summaries })
    },

    openDeck: async (id) => {
      set({ loading: true, saveState: initialSaveState })
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
        // Opening a deck moves the shell from Library into Build (#33).
        workspace: deck ? modeAfterOpenDeck() : get().workspace,
        mode: 'edit'
      })
    },

    createDeck: async (name, template) => {
      const deck = await window.cuedeck.decks.create(name, template)
      await get().refreshSummaries()
      // A freshly created deck is open, so land the user in Build (#33) on its
      // focused first card (blank demos + the starter template ship with at
      // least one card, so this is never an inert empty editor) (#34).
      set({
        deck,
        activeCardId: deck.cards[0]?.id ?? null,
        workspace: modeAfterOpenDeck(),
        mode: 'edit',
        saveState: initialSaveState
      })
    },

    deleteDeck: async (id) => {
      const summary = get().summaries.find((s) => s.id === id)
      const ok = await window.cuedeck.decks.remove(id)
      const { deck } = get()
      if (deck?.id === id) set({ deck: null, activeCardId: null })
      await get().refreshSummaries()
      set({
        statusMessage: ok
          ? `Deleted “${summary?.name ?? 'deck'}”.`
          : `Could not delete “${summary?.name ?? 'deck'}”.`
      })
    },

    renameDeck: async (id, name) => {
      const result = await window.cuedeck.decks.rename(id, name)
      if (!result.ok) {
        set({ statusMessage: result.error ?? 'Rename failed.' })
        return
      }
      await get().refreshSummaries()
      // Keep an open deck's title in sync when it is the one being renamed.
      const { deck } = get()
      if (deck?.id === id && result.summary) {
        set({ deck: { ...deck, name: result.summary.name } })
      }
      set({ statusMessage: `Renamed to “${result.summary?.name ?? name.trim()}”.` })
    },

    duplicateDeck: async (id) => {
      const result = await window.cuedeck.decks.duplicate(id)
      if (!result.ok) {
        set({ statusMessage: result.error ?? 'Duplicate failed.' })
        return
      }
      await get().refreshSummaries()
      set({ statusMessage: `Created “${result.summary?.name ?? 'copy'}”.` })
    },

    closeDeck: () => {
      // Never abandon the deck with unsaved edits still in the debounce window
      // (#38): flush first, then tear down. `void` because callers that need to
      // await persistence use `flushSave` directly.
      void get().flushSave()
      // Leaving a deck always returns to the full-chrome Library; make sure we
      // don't strand the user in a tiny always-on-top presenter window (#33).
      if (get().mode !== 'edit') {
        void window.cuedeck.window.setPresenter(false)
      }
      set({
        deck: null,
        activeCardId: null,
        mode: 'edit',
        workspace: modeAfterCloseDeck()
      })
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

    flushSave: async () => {
      // Cancel any debounced save and write synchronously so the last edit is
      // committed before we navigate away or exit (#38).
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      if (!needsFlush(get().saveState)) return
      await performSave()
    },

    setMode: (mode) => {
      if (get().mode === mode) return
      // Flush pending edits before the compact presenter takes over (#38).
      if (mode === 'present') void get().flushSave()
      set({ mode })
      // Keep the Studio workspace in sync so the shell rail reflects the
      // presenter window state driven by hotkeys / live control (#33). Exiting
      // the presenter window lands on Rehearse; entering it selects Present.
      set({ workspace: mode === 'present' ? 'present' : modeAfterExitPresent() })
      // Fire-and-forget the window side effects; the renderer layout switches
      // immediately regardless of how the OS honors resize/always-on-top.
      void window.cuedeck.window.setPresenter(mode === 'present')
    },

    toggleMode: () => get().setMode(flipMode(get().mode)),

    setWorkspace: (mode) => {
      const { deck, workspace } = get()
      const target = resolveModeRequest(mode, deck !== null)
      if (target === workspace) return
      // Ignore deck-specific requests with no deck open (guarded above, but be
      // explicit for callers wiring raw rail clicks).
      if (!canEnterMode(target, deck !== null)) return
      const windowMode = windowModeFor(target)
      // Flush pending edits before entering the read-only Present layout (#38).
      if (windowMode === 'present') void get().flushSave()
      set({ workspace: target, mode: windowMode })
      // Only touch the presenter window when the window layout actually changes.
      void window.cuedeck.window.setPresenter(windowMode === 'present')
    },

    exitPresent: () => {
      if (get().workspace !== 'present') return
      set({ workspace: modeAfterExitPresent(), mode: 'edit' })
      // Restore the pre-presenter bounds + always-on-top state.
      void window.cuedeck.window.setPresenter(false)
    },

    startPresenting: () => {
      // Readiness warnings inform but never block (#36 acceptance criteria):
      // this just enters Present regardless of the preflight result.
      get().setWorkspace('present')
    },

    focusBuildTarget: (fix) => {
      const { deck } = get()
      if (!deck) return
      // Move into Build first so the target location is actually mounted.
      get().setWorkspace('build')
      if (fix.target === 'step') {
        if (deck.cards.some((c) => c.id === fix.cardId)) {
          set({ activeCardId: fix.cardId })
        }
      } else {
        // Ask the Build editor to reveal the variables panel and focus the
        // named variable. Dispatched as a DOM event so the store stays DOM-free
        // and doesn't need refs into the editor tree.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(REVEAL_VARIABLE_EVENT, { detail: { name: fix.name } })
          )
        }
      }
    },

    clearFocusRequest: () => set({ focusRequest: null }),

    addCard: () => {
      const card: CueCard = { id: uid(), title: BUILD_LANGUAGE.step.defaultTitle, notes: '', snippets: [] }
      mutate((d) => ({ ...d, cards: [...d.cards, card] }))
      // Focus the new step and queue an autofocus on its title so it is
      // immediately ready for typing (#35 acceptance criteria).
      set({ activeCardId: card.id, focusRequest: { kind: 'step-title', id: card.id } })
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
      const snippet: Snippet = { id: uid(), label: BUILD_LANGUAGE.content.defaultLabel, content: '' }
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) =>
          c.id === cardId ? { ...c, snippets: [...c.snippets, snippet] } : c
        )
      }))
      // Queue an autofocus on the new block's label so it is ready for typing.
      set({ focusRequest: { kind: 'content-label', id: snippet.id } })
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
