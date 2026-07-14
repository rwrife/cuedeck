/**
 * Structured operation errors (#38).
 *
 * The renderer performs several fallible operations that must surface a clear,
 * typed failure *where they occur* rather than a stringly-typed status blob:
 * creating, opening, saving, importing, and exporting decks, plus toggling the
 * live-control bridge. These types give the store a small, uniform error model
 * so later UI work (#38 safety-ui) can render each failure in its own surface.
 *
 * Native-dialog *cancellation* is intentionally NOT an error — callers treat a
 * cancelled import/export as a neutral no-op and never construct one of these.
 */

/** Every user-facing operation surface that can report a failure. */
export type DeckOperation = 'create' | 'open' | 'save' | 'import' | 'export' | 'live'

/** A structured, renderable failure for one operation surface. */
export interface OperationError {
  operation: DeckOperation
  /** Human-readable, already-localized-enough message for display. */
  message: string
  /** ISO timestamp of when the failure was recorded. */
  at: string
}

/** Best-effort extraction of a human-readable message from an unknown throwable. */
export function errorMessageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return 'Something went wrong.'
}

/** Construct an {@link OperationError}, stamping the current time when unspecified. */
export function makeOperationError(
  operation: DeckOperation,
  message: string,
  at: string = new Date().toISOString()
): OperationError {
  return { operation, message, at }
}
