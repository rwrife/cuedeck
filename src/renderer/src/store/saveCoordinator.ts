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

  /**
   * Monotonic epoch bumped by {@link reset}. Each write captures the epoch it
   * started under; a completion whose epoch is stale (because the active deck
   * was replaced mid-write) must not mutate coordinator state for the new deck.
   */
  private generation = 0

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
   * Quiesce the coordinator so the underlying file can be safely deleted:
   * cancel any pending debounce and await any in-flight write to fully settle,
   * without starting new writes. After this resolves no save is pending or in
   * flight, so unlinking the deck cannot race a write that would recreate it.
   *
   * Resolves even if the in-flight (or pending) write failed — deletion
   * supersedes persistence, so a failed final save is intentionally discarded
   * rather than surfaced. Callers typically follow with {@link reset}.
   */
  async cancelPending(): Promise<void> {
    this.clearTimer()
    // Await any in-flight write to settle. Awaiting one may spawn a follow-up
    // (a stale write can auto-start the current generation's save on release, or
    // a completion can re-arm the debounce), so loop until the coordinator is
    // truly quiescent — no write in flight — before returning. The in-flight
    // promise never rejects (runSave catches internally), so awaiting is safe.
    let iterations = 0
    while (this.inFlight && iterations < MAX_FLUSH_ITERATIONS) {
      iterations += 1
      await this.inFlight
      this.clearTimer()
    }
    this.clearTimer()
  }

  /**
   * Return to a clean idle state, cancelling any pending debounce and clearing
   * revisions/error. Used when the active deck is replaced (open/create/close)
   * so the new deck starts from a trustworthy "saved" baseline and never
   * inherits the previous deck's dirty/error state. Bumping the generation
   * fences off any in-flight write started for the previous deck: when it
   * settles it releases its own in-flight handle but does not touch
   * savedRevision, error, onSaved, or re-arm for the new deck.
   */
  reset(): void {
    this.clearTimer()
    this.generation += 1
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
    const generationBeingSaved = this.generation
    this.savingRevision = revisionBeingSaved
    this.error = null
    this.publish()

    this.inFlight = (async () => {
      try {
        const saved = await this.options.save(deck)
        // Stale completion: the deck was reset/replaced while we were writing.
        // Ignore the result entirely so it can't mark the new deck saved.
        if (generationBeingSaved !== this.generation) return
        this.savingRevision = null
        this.savedRevision = Math.max(this.savedRevision, revisionBeingSaved)
        this.options.onSaved?.(deck.id, saved.updatedAt)
      } catch (err) {
        // Stale failure: don't surface the previous deck's error on the new one.
        if (generationBeingSaved !== this.generation) return
        this.savingRevision = null
        this.error = { message: errorMessage(err) }
      } finally {
        // Release the in-flight handle so flush()/cancelPending() can make
        // progress. Safe to null unconditionally: no other write can replace it
        // while it is non-null (runSave early-returns), and reset() never
        // reassigns it — so this always releases exactly this write.
        this.inFlight = null
        if (generationBeingSaved === this.generation) {
          this.publish()
          // Newer edits arrived while we were writing (and the write succeeded):
          // make sure a follow-up write is armed even if no further edit fires.
          if (!this.error && this.hasUnsavedEdits() && !this.timer) {
            this.armTimer()
          }
        } else if (this.hasUnsavedEdits()) {
          // Stale write: this write belonged to a previous generation, but the
          // current deck has pending edits whose debounce may have been swallowed
          // while this write occupied the in-flight slot (runSave early-returns
          // when a write is in flight). Now that the slot is free, kick off the
          // current generation's save so the new deck cannot stay dirty forever
          // without another edit or an explicit flush. runSave reads the *current*
          // deck/revision, so no stale value leaks into the new generation.
          void this.runSave()
        }
      }
    })()

    return this.inFlight
  }
}
