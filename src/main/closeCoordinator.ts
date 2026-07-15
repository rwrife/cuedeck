/**
 * Shutdown handshake coordinator (#38).
 *
 * A pure state machine (no Electron dependency, so it is unit-testable) that
 * makes app/window shutdown safe: an edit made immediately before the user hits
 * "close" — or quits the app — must not be silently discarded by the renderer's
 * save debounce.
 *
 * It governs two distinct lifecycles because they need different resume actions:
 *
 *  - **Ordinary window close** (red button / Ctrl+W): flush, then re-issue the
 *    window close. On macOS this correctly leaves the app running in the dock.
 *  - **App quit** (Cmd+Q / `app.quit()`): Electron fires `before-quit` and then
 *    closes each window. If we merely re-`close()` the window after flushing,
 *    the quit stays cancelled and the app lingers in the dock. So a quit-driven
 *    close must resume the *quit*, not just the window close.
 *
 * The imperative shell (`src/main/index.ts`) wires this to the real
 * `BrowserWindow` `close` event, the `app` `before-quit` event, and an IPC
 * handshake:
 *
 *   1. On the first `close`, {@link requestClose} (told whether an app quit is
 *      in progress) returns `proceed: false, shouldFlush: true`. The shell calls
 *      `event.preventDefault()`, asks the renderer to flush, and arms a safety
 *      timeout.
 *   2. The renderer flushes and acks → {@link onFlushComplete}; or the timeout
 *      fires → {@link onFlushTimeout}. Either way we become `closable` and hand
 *      back a `resume` action of `'close'` or `'quit'`.
 *   3. The shell performs the resume action. The follow-up `close` now returns
 *      `proceed: true`, so the window closes / the app quits for real.
 *
 * Duplicate close events, a quit that lands mid-flush, and late/spurious acks
 * are all handled idempotently so a flaky OS or renderer can neither trigger a
 * second flush round-trip nor spin a recursive close/quit loop.
 */

export type CloseGuardState = 'open' | 'flushing' | 'closable'

/** What the shell should do once a flush resolves. */
export type ResumeAction = 'none' | 'close' | 'quit'

export interface CloseDecision {
  /** True when the caller may let the close proceed. */
  proceed: boolean
  /** True when the caller should kick off a renderer flush + safety timeout. */
  shouldFlush: boolean
}

export interface FlushResolution {
  /**
   * The action the caller should take now that the flush resolved: re-issue the
   * window `close`, resume the app `quit`, or nothing (a late/spurious signal).
   */
  resume: ResumeAction
}

export class CloseGuard {
  private state: CloseGuardState = 'open'
  /** Whether the pending shutdown is an app quit (vs an ordinary window close). */
  private quitting = false

  getState(): CloseGuardState {
    return this.state
  }

  /**
   * Evaluate an incoming close request against the handshake state.
   *
   * @param quitting True when this close is part of an app quit (an
   *   `app`/`before-quit` intent is in progress), so the flush should resume the
   *   quit rather than only the window close.
   */
  requestClose(quitting = false): CloseDecision {
    switch (this.state) {
      case 'open':
        this.state = 'flushing'
        this.quitting = quitting
        return { proceed: false, shouldFlush: true }
      case 'flushing':
        // A duplicate close arrived mid-flush; keep waiting, don't re-flush.
        // If a quit lands while an ordinary-close flush is in progress, upgrade
        // the intent so we resume the quit (the user's ultimate goal).
        if (quitting) this.quitting = true
        return { proceed: false, shouldFlush: false }
      case 'closable':
        return { proceed: true, shouldFlush: false }
    }
  }

  /** The renderer acked that pending edits are flushed. */
  onFlushComplete(): FlushResolution {
    return this.resolveFlush()
  }

  /** The flush safety timeout fired; resolve so shutdown can't hang. */
  onFlushTimeout(): FlushResolution {
    return this.resolveFlush()
  }

  /** Return to the open state when a close is cancelled or a new window opens. */
  reset(): void {
    this.state = 'open'
    this.quitting = false
  }

  private resolveFlush(): FlushResolution {
    if (this.state !== 'flushing') {
      // No close pending, or already resolved by an earlier signal: no-op.
      return { resume: 'none' }
    }
    this.state = 'closable'
    return { resume: this.quitting ? 'quit' : 'close' }
  }
}
