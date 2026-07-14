/**
 * Save coordinator (#38).
 *
 * A small, framework-agnostic state machine that owns *when* and *whether* a
 * deck is persisted, and reports an explicit status the UI can trust. It exists
 * to replace the previous fragile module-level `setTimeout` debounce that:
 *
 *  - had no failure state (a rejected write left `saving` stuck / looked saved),
 *  - could overwrite newer in-memory edits with a stale snapshot captured before
 *    the write started, and
 *  - had no way to force-flush pending edits before closing a deck, entering
 *    Present, or shutting the app down.
 *
 * The coordinator is deliberately free of Electron, React, Zustand, and DOM
 * dependencies (and of `@shared` path aliases) so it is trivially unit-testable
 * with fake timers. The Zustand store wires it to real IPC + `setTimeout` and
 * republishes {@link SaveView} into renderer state.
 *
 * Correctness model — every edit bumps a monotonic `revision`; a write records
 * the revision it is persisting. On completion we compare against the latest
 * revision so a write can never mark the deck "saved" while newer edits are
 * still pending, and a completed (possibly stale) write only stamps metadata
 * onto the *current* deck via {@link applySavedTimestamp} — never its own older
 * snapshot.
 */

/** The four persistence states surfaced to the UI. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** A structured, human-readable persistence failure. */
export interface SaveError {
  message: string
}

/** The public, serializable view of save state the UI renders. */
export interface SaveView {
  status: SaveStatus
  /** True while there are edits not yet durably persisted. */
  dirty: boolean
  error: SaveError | null
}

/** The minimum shape the coordinator needs from a persistable record. */
export interface Persistable {
  id: string
  updatedAt: string
}

export interface SaveCoordinatorOptions<T extends Persistable> {
  /** Perform the durable write; resolves to the persisted record (with a fresh `updatedAt`). */
  save: (deck: T) => Promise<T>
  /** Read the *current* in-memory deck at the moment a write begins. */
  getDeck: () => T | null
  /** Publish an updated {@link SaveView} (e.g. into the store). */
  onChange?: (view: SaveView) => void
  /**
   * Called after a successful write with the persisted record's id and its new
   * `updatedAt`. The caller should stamp it onto the *current* deck (see
   * {@link applySavedTimestamp}) so a completed write never clobbers newer edits.
   */
  onSaved?: (savedId: string, updatedAt: string) => void
  /** Debounce window in ms before a quiescent edit is written. */
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 500
/** Upper bound on flush drain iterations; a guard against pathological churn. */
const MAX_FLUSH_ITERATIONS = 100

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown save error.'
}

/**
 * Stamp a persisted `updatedAt` onto the current deck without touching any other
 * field. Returns the same reference when the deck is null, belongs to a
 * different id (a stale completion for a deck we've since navigated away from),
 * or already carries the timestamp — so React/Zustand identity checks stay
 * stable and, critically, newer content edits are never overwritten.
 */
export function applySavedTimestamp<T extends Persistable>(
  deck: T | null,
  savedId: string,
  updatedAt: string
): T | null {
  if (!deck) return deck
  if (deck.id !== savedId) return deck
  if (deck.updatedAt === updatedAt) return deck
  return { ...deck, updatedAt }
}

export class SaveCoordinator<T extends Persistable> {
  private readonly options: SaveCoordinatorOptions<T>
  private readonly debounceMs: number

  /** Latest edit revision. */
  private revision = 0
  /** Highest revision that has been durably written. */
  private savedRevision = 0
  /** Revision currently being written, or null when no write is in flight. */
  private savingRevision: number | null = null
  private error: SaveError | null = null

  private timer: ReturnType<typeof setTimeout> | null = null
  /** The in-flight write promise, so flush/overlap can await it. */
  private inFlight: Promise<void> | null = null

  constructor(options: SaveCoordinatorOptions<T>) {
    this.options = options
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  }

  /** Current save state as rendered by the UI. */
  getView(): SaveView {
    return {
      status: this.status(),
      dirty: this.revision > this.savedRevision,
      error: this.error
    }
  }

  /** Record that the deck changed, and (re)arm the debounced write. */
  noteEdit(): void {
    this.revision += 1
    this.armTimer()
    this.publish()
  }

  /**
   * Force all pending edits to disk now, bypassing the debounce, and wait for
   * the result. Safe to call before closing a deck, entering Present, or app
   * shutdown. Resolves with the resulting view; on a persistent write failure it
   * resolves (does not reject) with an `error` view so the caller can decide.
   */
  async flush(): Promise<SaveView> {
    this.clearTimer()
    let iterations = 0
    while (iterations < MAX_FLUSH_ITERATIONS) {
      iterations += 1
      if (this.inFlight) {
        await this.inFlight
        continue
      }
      if (!this.hasUnsavedEdits()) break
      // Don't spin retrying a write that just failed; surface the error instead.
      if (this.error) break
      await this.runSave()
    }
    return this.getView()
  }

  /** Explicitly retry after a failure (clears the error and writes now). */
  async retry(): Promise<SaveView> {
    this.error = null
    this.publish()
    if (this.inFlight) await this.inFlight
    if (this.hasUnsavedEdits()) await this.runSave()
    return this.getView()
  }

  /** Cancel any pending debounce (e.g. on teardown). */
  dispose(): void {
    this.clearTimer()
  }

  /**
   * Return to a clean idle state, cancelling any pending debounce and clearing
   * revisions/error. Used when the active deck is replaced (open/create/close)
   * so the new deck starts from a trustworthy "saved" baseline and never
   * inherits the previous deck's dirty/error state. An already in-flight write
   * is left to settle harmlessly — {@link applySavedTimestamp} guards it by id.
   */
  reset(): void {
    this.clearTimer()
    this.revision = 0
    this.savedRevision = 0
    this.savingRevision = null
    this.error = null
    this.publish()
  }

  private hasUnsavedEdits(): boolean {
    return this.revision > this.savedRevision
  }

  private status(): SaveStatus {
    if (this.savingRevision !== null) return 'saving'
    if (this.error) return 'error'
    if (this.savedRevision > 0 && !this.hasUnsavedEdits()) return 'saved'
    return 'idle'
  }

  private publish(): void {
    this.options.onChange?.(this.getView())
  }

  private armTimer(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.runSave()
    }, this.debounceMs)
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Perform a single write of the current deck if one is warranted. Returns the
   * in-flight promise so callers can await completion; overlapping calls share
   * the same in-flight write rather than starting a second.
   */
  private runSave(): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (!this.hasUnsavedEdits()) return Promise.resolve()

    const deck = this.options.getDeck()
    if (!deck) return Promise.resolve()

    const revisionBeingSaved = this.revision
    this.savingRevision = revisionBeingSaved
    this.error = null
    this.publish()

    this.inFlight = (async () => {
      try {
        const saved = await this.options.save(deck)
        this.savingRevision = null
        this.savedRevision = Math.max(this.savedRevision, revisionBeingSaved)
        this.options.onSaved?.(deck.id, saved.updatedAt)
      } catch (err) {
        this.savingRevision = null
        this.error = { message: errorMessage(err) }
      } finally {
        this.inFlight = null
        this.publish()
        // Newer edits arrived while we were writing (and the write succeeded):
        // make sure a follow-up write is armed even if no further edit fires.
        if (!this.error && this.hasUnsavedEdits() && !this.timer) {
          this.armTimer()
        }
      }
    })()

    return this.inFlight
  }
}
