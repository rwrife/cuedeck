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
import { applyStarterTemplate } from '@shared/library'
import {
  errorMessageOf,
  makeOperationError,
  type DeckOperation,
  type OperationError
} from '@shared/operations'
import { useSettingsStore } from './settingsStore'
import { playCopyChime } from '../lib/copySound'
import {
  applySavedTimestamp,
  SaveCoordinator,
  type SaveError,
  type SaveStatus
} from './saveCoordinator'

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
  /**
   * Explicit persistence status (#38). Replaces the previous fragile `saving`
   * boolean: `idle` (nothing pending), `saving` (a write is in flight), `saved`
   * (durably persisted), or `error` (the last write failed). Driven by the pure
   * {@link SaveCoordinator} so a failed save can never masquerade as saved.
   */
  saveStatus: SaveStatus
  /** True while there are edits not yet durably persisted. */
  saveDirty: boolean
  /** Structured last-save failure, or null. */
  saveError: SaveError | null
  /**
   * Structured, per-operation failures surfaced to the UI so later work can
   * render each error where it occurred (#38). Native-dialog cancellation is a
   * neutral no-op and never populates this map.
   */
  errors: Partial<Record<DeckOperation, OperationError>>
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
  /** Tone for {@link statusMessage} — drives which `StatusBanner` variant renders it. */
  statusTone: StatusTone
  /**
   * Id of a card that should receive DOM focus the next time it renders
   * (#34): set whenever a new card is created (including the guided New
   * Demo blank-deck flow's seeded first step) so Build can land the user's
   * cursor there instead of an inert, unfocused editor. Consumed (cleared)
   * by the component that performs the focus.
   */
  focusCardId: string | null

  // Deck lifecycle
  refreshSummaries: () => Promise<void>
  openDeck: (id: string) => Promise<void>
  createDeck: (name: string) => Promise<void>
  /**
   * Guided New Demo → "Blank demo" (#34): create an empty deck, then seed
   * and focus one first step so Build never opens on an inert empty editor.
   * A no-op seed step if `createDeck` itself failed (surfaced via the
   * existing `create` operation error).
   */
  createBlankDemo: (name: string) => Promise<void>
  /**
   * Guided New Demo → "Starter template" (#34): create an empty deck, then
   * apply the small, pure {@link applyStarterTemplate} sample so the user
   * lands on a useful, already-populated demo instead of a blank one. Does
   * not alter the persisted deck schema — the result is an ordinary deck.
   */
  createFromTemplate: (name: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
  /**
   * Rename a deck in place (#34). Works on any deck in the Library, not just
   * the currently-open one; keeps the open deck's in-memory name in sync
   * when it's the one being renamed. Explicit success/failure feedback via
   * `statusMessage` and the `'rename'` operation error — never a silent
   * no-op. When `id` is the currently-open deck, flushes its pending edits
   * first (code-quality follow-up to #34) so a concurrent debounced autosave
   * can never race the filesystem rename; a flush failure aborts the rename,
   * preserves the open deck untouched, and surfaces the typed save error.
   */
  renameDeck: (id: string, name: string) => Promise<void>
  /**
   * Duplicate a deck (#34): the copy gets a fresh id and a non-colliding
   * "<name> copy" name (assigned by the main process) and appears in the
   * Library immediately. Explicit success/failure feedback, matching
   * {@link renameDeck} — including the same open-deck pre-flush gating, so a
   * duplicate can never race a pending autosave of the source deck.
   */
  duplicateDeck: (id: string) => Promise<void>
  closeDeck: () => Promise<void>

  // Persistence control (#38)
  /**
   * Force any pending debounced edits to disk immediately and wait for the
   * result. Called before closing a deck, entering Present, or app shutdown so
   * the debounce can never silently discard the last change.
   */
  flushPendingSave: () => Promise<void>
  /** Retry the last failed save (clears the error and writes now). */
  retrySave: () => Promise<void>

  // Import / export
  exportDeck: (id: string) => Promise<void>
  importDeck: () => Promise<void>
  setStatusMessage: (message: string | null, tone?: StatusTone) => void
  /** Record a structured failure for an operation surface (#38). */
  setOperationError: (operation: DeckOperation, message: string) => void
  /** Clear a previously-recorded operation failure. */
  clearOperationError: (operation: DeckOperation) => void

  // Presenter mode (#5) / Studio mode navigation (#33)
  /**
   * Guarded mode-rail navigation: switches to `mode` when it's available
   * (Library is always available; Build/Rehearse/Present require an open
   * deck) and is a no-op otherwise. Selecting `'present'` delegates to
   * {@link enterPresent} so the window side effects stay consistent.
   */
  selectWorkspaceMode: (mode: WorkspaceMode) => void
  /**
   * Enter Present: flushes pending edits first (#38), then switches to the
   * compact, read-only layout and drives the main-process window side effects
   * (compact size + always-on-top) via `window.cuedeck.window.setPresenter`. A
   * no-op without an open deck; a failed pre-transition flush keeps the current
   * mode so nothing is lost, consistent with {@link closeDeck}.
   */
  enterPresent: () => Promise<void>
  /**
   * Exit Present back to Rehearse, restoring the prior window bounds and
   * always-on-top state via the same trusted IPC. A no-op when not currently
   * presenting.
   */
  exitPresent: () => void

  // Card ops
  /**
   * Add a new step (internally a `CueCard`) to the end of the running order,
   * make it active, and return its id (#35) so the calling UI can focus its
   * title the instant it renders — a newly created step must never sit
   * unfocused waiting for a second click.
   */
  addCard: () => string
  updateCard: (cardId: string, patch: Partial<Omit<CueCard, 'id'>>) => void
  removeCard: (cardId: string) => void
  setActiveCard: (cardId: string) => void
  /** Move the active card by a step in the running order (-1 prev, +1 next). */
  stepActiveCard: (step: -1 | 1) => void
  /** Move a card from one position to another in the running order. */
  reorderCards: (fromIndex: number, toIndex: number) => void
  /** Consume the pending {@link focusCardId} request (called once focus is applied). */
  clearFocusCard: () => void

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
  /**
   * Add a new paste-ready content item (internally a `Snippet`) to `cardId`
   * and return its id, or `null` when `cardId` doesn't match any step (#35).
   * The returned id lets the calling UI immediately expand and focus the new
   * item's label instead of leaving it collapsed and unfocused.
   */
  addSnippet: (cardId: string) => string | null
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

let copyFlashTimer: ReturnType<typeof setTimeout> | null = null

/** Duration of the "Copied ✓" flash, in ms. Shared by button + hotkeys. */
export const COPY_FLASH_MS = 1200

/** Debounce window (ms) before a quiescent edit is persisted. */
export const SAVE_DEBOUNCE_MS = 500

/**
 * Tone for the transient {@link DeckState.statusMessage} (#34 Feedback and
 * Error Handling): lets Library render the shared `StatusBanner` with the
 * right color/icon instead of every failure looking identical to a success.
 */
export type StatusTone = 'neutral' | 'success' | 'danger'

export const useDeckStore = create<DeckState>((set, get) => {
  /**
   * Explicit, race-safe persistence (#38). The pure {@link SaveCoordinator}
   * owns debounce timing, the idle/saving/saved/error status, flush, and retry.
   * It always writes the *current* deck (`getDeck`) and, on completion, only
   * stamps `updatedAt` onto the current deck via {@link applySavedTimestamp} —
   * so a slow write can never overwrite newer in-memory edits, and a failure is
   * surfaced instead of silently looking saved.
   */
  const saveCoordinator = new SaveCoordinator<Deck>({
    debounceMs: SAVE_DEBOUNCE_MS,
    save: (deck) => window.cuedeck.decks.save(deck),
    getDeck: () => get().deck,
    onChange: (view) =>
      set({ saveStatus: view.status, saveDirty: view.dirty, saveError: view.error }),
    onSaved: (savedId, updatedAt) =>
      set((s) => {
        const next = applySavedTimestamp(s.deck, savedId, updatedAt)
        return next === s.deck ? {} : { deck: next }
      })
  })

  /** Apply a mutation to the active deck, then schedule a debounced save. */
  function mutate(fn: (deck: Deck) => Deck): void {
    const { deck } = get()
    if (!deck) return
    set({ deck: fn(deck) })
    saveCoordinator.noteEdit()
  }

  /**
   * Gate a Library filesystem operation (rename/duplicate) on `id` against a
   * concurrent autosave of the *same* deck (code-quality follow-up to #34):
   * Library is reachable without closing the open deck, so its pending
   * debounced edit could otherwise still be in flight or scheduled when a
   * rename/duplicate touches the same file underneath it. When `id` is the
   * currently-open deck, flushes it first and returns `true` only if that
   * flush actually succeeded. A flush failure aborts the caller — the open
   * deck is left untouched and the typed `operation` error + `statusMessage`
   * are set from the save failure, rather than proceeding against stale
   * on-disk data. A no-op (always `true`, no flush) when `id` isn't the open
   * deck, so browsing/acting on other decks never pays for an unrelated
   * flush.
   */
  async function flushIfOpenDeck(id: string, operation: DeckOperation): Promise<boolean> {
    if (get().deck?.id !== id) return true
    const view = await saveCoordinator.flush()
    if (view.status !== 'error') return true
    const message = view.error?.message ?? 'Could not save pending changes.'
    const verb = operation === 'rename' ? 'Rename' : 'Duplicate'
    get().setOperationError(operation, message)
    set({ statusMessage: `${verb} failed: ${message}`, statusTone: 'danger' })
    return false
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
    saveStatus: 'idle',
    saveDirty: false,
    saveError: null,
    errors: {},
    workspaceMode: 'library',
    lastCopiedSnippetId: null,
    statusMessage: null,
    statusTone: 'neutral',
    focusCardId: null,

    refreshSummaries: async () => {
      const summaries = await window.cuedeck.decks.list()
      set({ summaries })
    },

    openDeck: async (id) => {
      // Flush the outgoing deck's pending debounced edit first — Library is
      // reachable without closing the open deck, so switching decks must not
      // race the save debounce and lose the last edit (#33). Best-effort: the
      // fresh deck below establishes its own trustworthy baseline via reset().
      await saveCoordinator.flush()
      set({ loading: true })
      try {
        const loaded = await window.cuedeck.decks.load(id)
        if (!loaded) {
          set({ loading: false })
          get().setOperationError('open', 'This deck could not be opened.')
          return
        }
        // Route the loaded deck through the shared validator/normalizer. A deck
        // that is already valid AND at the current schema version passes through
        // unchanged; anything older (e.g. a v1 deck with no `variables`) or loose
        // is migrated/repaired via normalizeDeck so it renders correctly and,
        // once touched, persists in the upgraded shape.
        const isCurrent =
          validateDeck(loaded).ok && loaded.schemaVersion === CURRENT_SCHEMA_VERSION
        const deck = isCurrent ? loaded : normalizeDeck(loaded)
        // Fresh deck → fresh, trustworthy save baseline (never inherit the
        // previous deck's dirty/error state).
        saveCoordinator.reset()
        set({
          deck,
          loading: false,
          activeCardId: deck.cards[0]?.id ?? null,
          // Opening a deck moves the Studio from Library to Build (#33).
          workspaceMode: modeAfterOpenDeck()
        })
        get().clearOperationError('open')
      } catch (err) {
        set({ loading: false })
        get().setOperationError('open', errorMessageOf(err))
      }
    },

    createDeck: async (name) => {
      // Same rationale as `openDeck`: flush any pending edit on the
      // currently-open deck before it's replaced by the new one (#33).
      await saveCoordinator.flush()
      try {
        const deck = await window.cuedeck.decks.create(name)
        await get().refreshSummaries()
        // Fresh deck → fresh, trustworthy save baseline.
        saveCoordinator.reset()
        // Creating a deck moves the Studio from Library to Build (#33).
        set({ deck, activeCardId: null, workspaceMode: modeAfterOpenDeck() })
        get().clearOperationError('create')
      } catch (err) {
        get().setOperationError('create', errorMessageOf(err))
      }
    },

    createBlankDemo: async (name) => {
      await get().createDeck(name)
      const { deck, errors } = get()
      // Only seed a first step when creation actually succeeded — a `create`
      // failure leaves `deck` as whatever was open before (or null), and must
      // not be mistaken for a fresh, seedable deck.
      if (deck && !errors.create && deck.cards.length === 0) {
        get().addCard()
      }
    },

    createFromTemplate: async (name) => {
      await get().createDeck(name)
      const { deck, errors } = get()
      if (deck && !errors.create) {
        mutate((d) => applyStarterTemplate(d))
        const templated = get().deck
        set({
          activeCardId: templated?.cards[0]?.id ?? null,
          focusCardId: templated?.cards[0]?.id ?? null
        })
      }
    },

    deleteDeck: async (id) => {
      const { deck, workspaceMode } = get()
      if (deck?.id === id) {
        // Quiesce the coordinator BEFORE unlinking so an in-flight or pending
        // save cannot recreate the file we're about to delete (#38). A failed
        // final save is intentionally discarded — deletion supersedes
        // persistence. `cancelPending` awaits any in-flight write and cancels
        // the debounce; `reset` then fences it off and clears state.
        await saveCoordinator.cancelPending()
        saveCoordinator.reset()
        // Don't strand the user in a tiny always-on-top presenter window.
        if (workspaceMode === 'present') void window.cuedeck.window.setPresenter(false)
        set({ deck: null, activeCardId: null, workspaceMode: modeAfterCloseDeck() })
      }
      try {
        const result = await window.cuedeck.decks.remove(id)
        if (result.ok) {
          get().clearOperationError('delete')
          set({ statusMessage: 'Deck deleted.', statusTone: 'success' })
        } else {
          const message = result.error ?? 'Could not delete this deck.'
          get().setOperationError('delete', message)
          set({ statusMessage: `Delete failed: ${message}`, statusTone: 'danger' })
        }
      } catch (err) {
        const message = errorMessageOf(err)
        get().setOperationError('delete', message)
        set({ statusMessage: `Delete failed: ${message}`, statusTone: 'danger' })
      }
      // Refresh regardless of outcome: on success the deck is gone; on
      // failure the file is still on disk, so the deck correctly reappears
      // instead of the Library silently pretending it was removed.
      await get().refreshSummaries()
    },

    renameDeck: async (id, name) => {
      if (!(await flushIfOpenDeck(id, 'rename'))) return
      try {
        const result = await window.cuedeck.decks.rename(id, name)
        if (result.ok && result.summary) {
          get().clearOperationError('rename')
          // Keep the open deck's in-memory name in sync if it's the one
          // being renamed, so the Build header reflects it immediately.
          set((s) =>
            s.deck?.id === id ? { deck: { ...s.deck, name: result.summary!.name } } : {}
          )
          await get().refreshSummaries()
          set({ statusMessage: `Renamed to “${result.summary.name}”.`, statusTone: 'success' })
        } else {
          const message = result.error ?? 'Could not rename this deck.'
          get().setOperationError('rename', message)
          set({ statusMessage: `Rename failed: ${message}`, statusTone: 'danger' })
        }
      } catch (err) {
        const message = errorMessageOf(err)
        get().setOperationError('rename', message)
        set({ statusMessage: `Rename failed: ${message}`, statusTone: 'danger' })
      }
    },

    duplicateDeck: async (id) => {
      if (!(await flushIfOpenDeck(id, 'duplicate'))) return
      try {
        const result = await window.cuedeck.decks.duplicate(id)
        if (result.ok && result.summary) {
          get().clearOperationError('duplicate')
          await get().refreshSummaries()
          set({ statusMessage: `Duplicated as “${result.summary.name}”.`, statusTone: 'success' })
        } else {
          const message = result.error ?? 'Could not duplicate this deck.'
          get().setOperationError('duplicate', message)
          set({ statusMessage: `Duplicate failed: ${message}`, statusTone: 'danger' })
        }
      } catch (err) {
        const message = errorMessageOf(err)
        get().setOperationError('duplicate', message)
        set({ statusMessage: `Duplicate failed: ${message}`, statusTone: 'danger' })
      }
    },

    closeDeck: async () => {
      // Persist any pending edits before leaving the deck so the debounce can't
      // discard the last change (#38). If that final write fails, keep the deck
      // open so nothing is lost — the structured save error is already surfaced.
      const view = await saveCoordinator.flush()
      if (view.status === 'error') return
      // Leaving a deck always returns to Library; make sure we don't strand
      // the user in a tiny always-on-top presenter window.
      if (get().workspaceMode === 'present') {
        void window.cuedeck.window.setPresenter(false)
      }
      saveCoordinator.reset()
      set({ deck: null, activeCardId: null, workspaceMode: modeAfterCloseDeck() })
    },

    flushPendingSave: async () => {
      await saveCoordinator.flush()
    },

    retrySave: async () => {
      await saveCoordinator.retry()
    },

    exportDeck: async (id) => {
      try {
        const result = await window.cuedeck.decks.export(id)
        if (result.error) {
          get().setOperationError('export', result.error)
          set({ statusMessage: `Export failed: ${result.error}`, statusTone: 'danger' })
        } else if (result.ok && result.filePath) {
          get().clearOperationError('export')
          set({ statusMessage: `Exported to ${result.filePath}`, statusTone: 'success' })
        }
        // Silent, neutral no-op when the user simply cancelled the dialog.
      } catch (err) {
        const message = errorMessageOf(err)
        get().setOperationError('export', message)
        set({ statusMessage: `Export failed: ${message}`, statusTone: 'danger' })
      }
    },

    importDeck: async () => {
      try {
        const result = await window.cuedeck.decks.import()
        if (result.error) {
          get().setOperationError('import', result.error)
          set({ statusMessage: `Import failed: ${result.error}`, statusTone: 'danger' })
          return
        }
        if (result.ok && result.summary) {
          await get().refreshSummaries()
          get().clearOperationError('import')
          set({ statusMessage: `Imported “${result.summary.name}”.`, statusTone: 'success' })
        }
        // Silent, neutral no-op when the user cancelled the dialog.
      } catch (err) {
        const message = errorMessageOf(err)
        get().setOperationError('import', message)
        set({ statusMessage: `Import failed: ${message}`, statusTone: 'danger' })
      }
    },

    setStatusMessage: (message, tone = 'neutral') => set({ statusMessage: message, statusTone: tone }),

    setOperationError: (operation, message) =>
      set((s) => ({
        errors: { ...s.errors, [operation]: makeOperationError(operation, message) }
      })),

    clearOperationError: (operation) =>
      set((s) => {
        if (!s.errors[operation]) return {}
        const next = { ...s.errors }
        delete next[operation]
        return { errors: next }
      }),

    selectWorkspaceMode: (mode) => {
      if (mode === 'present') {
        void get().enterPresent()
        return
      }
      const { workspaceMode, deck } = get()
      const next = resolveModeSelection(mode, workspaceMode, deck !== null)
      if (next !== workspaceMode) set({ workspaceMode: next })
    },

    enterPresent: async () => {
      const { workspaceMode, deck } = get()
      const next = modeAfterEnterPresent(workspaceMode, deck !== null)
      if (next === workspaceMode) return
      // Flush pending edits before the compact, read-only Present surface (#38).
      // A failed flush keeps the current mode and preserves the typed save error
      // so nothing is lost — consistent with closeDeck — instead of entering a
      // Presenter window mid-failure.
      const view = await saveCoordinator.flush()
      if (view.status === 'error') return
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
      // Empty title (#35): the presenter-friendly "Untitled step" fallback
      // covers display, and starting empty keeps focus-on-create natural
      // (select() on an empty field is a no-op cursor, not a value to clear).
      const card: CueCard = { id: uid(), title: '', notes: '', snippets: [] }
      mutate((d) => ({ ...d, cards: [...d.cards, card] }))
      // Focus the new card immediately (#34/Accessibility: focus moves to
      // newly created content) rather than leaving the user to hunt for it,
      // and return its id so in-Build callers (#35) can also act on it.
      set({ activeCardId: card.id, focusCardId: card.id })
      return card.id
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

    clearFocusCard: () => {
      if (get().focusCardId !== null) set({ focusCardId: null })
    },

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
      // Guard against an unknown/stale cardId: no card matched, so don't
      // spread a no-op deck copy through mutate() (which would arm a save
      // for nothing) and don't report a bogus new id to the caller.
      const { deck } = get()
      if (!deck?.cards.some((c) => c.id === cardId)) return null

      const snippet: Snippet = { id: uid(), label: '', content: '' }
      mutate((d) => ({
        ...d,
        cards: d.cards.map((c) =>
          c.id === cardId ? { ...c, snippets: [...c.snippets, snippet] } : c
        )
      }))
      return snippet.id
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
