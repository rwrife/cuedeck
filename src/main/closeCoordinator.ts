/**
 * Close/flush handshake coordinator (#38).
 *
 * A pure state machine (no Electron dependency, so it is unit-testable) that
 * makes app/window shutdown safe: an edit made immediately before the user hits
 * "close" must not be silently discarded by the renderer's save debounce.
 *
 * The imperative shell (`src/main/index.ts`) wires this to the real
 * `BrowserWindow` `close` event and an IPC handshake:
 *
 *   1. On the first `close`, {@link requestClose} returns `proceed: false` and
 *      `shouldFlush: true`. The shell calls `event.preventDefault()`, asks the
 *      renderer to flush pending edits, and arms a safety timeout.
 *   2. The renderer flushes its pending save, then acks. The shell calls
 *      {@link onFlushComplete}; if the timeout fires first it calls
 *      {@link onFlushTimeout} instead — either way we become `closable` and
 *      never hang forever.
 *   3. The shell re-issues `window.close()`; this time {@link requestClose}
 *      returns `proceed: true` and the window actually closes.
 *
 * Duplicate close events and late/spurious acks are handled idempotently so a
 * flaky OS or renderer can neither trigger a second flush round-trip nor reopen
 * a window that is already on its way out.
 */

export type CloseGuardState = 'open' | 'flushing' | 'closable'

export interface CloseDecision {
  /** True when the caller may let the close proceed. */
  proceed: boolean
  /** True when the caller should kick off a renderer flush + safety timeout. */
  shouldFlush: boolean
}

export interface FlushResolution {
  /** True when the caller should now re-issue the window close. */
  shouldClose: boolean
}

export class CloseGuard {
  private state: CloseGuardState = 'open'

  getState(): CloseGuardState {
    return this.state
  }

  /** Evaluate an incoming close request against the handshake state. */
  requestClose(): CloseDecision {
    switch (this.state) {
      case 'open':
        this.state = 'flushing'
        return { proceed: false, shouldFlush: true }
      case 'flushing':
        // A duplicate close arrived mid-flush; keep waiting, don't re-flush.
        return { proceed: false, shouldFlush: false }
      case 'closable':
        return { proceed: true, shouldFlush: false }
    }
  }

  /** The renderer acked that pending edits are flushed. */
  onFlushComplete(): FlushResolution {
    return this.resolveFlush()
  }

  /** The flush safety timeout fired; resolve the close so shutdown can't hang. */
  onFlushTimeout(): FlushResolution {
    return this.resolveFlush()
  }

  /** Return to the open state when a pending close is cancelled elsewhere. */
  reset(): void {
    this.state = 'open'
  }

  private resolveFlush(): FlushResolution {
    if (this.state !== 'flushing') {
      // No close pending, or already resolved by an earlier signal: no-op.
      return { shouldClose: false }
    }
    this.state = 'closable'
    return { shouldClose: true }
  }
}
