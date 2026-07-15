import type { SaveStatus } from '../../store/saveCoordinator'

/**
 * Map the explicit save state (#38) to a short, human-readable status label.
 *
 * Kept as a pure helper (and unit-tested) so the exact wording — and the
 * guarantee that a failure never reads as "Saved" — is verified independently
 * of any component. `''` means "show nothing" (a clean deck that has never been
 * edited this session).
 */
export function saveStatusLabel(status: SaveStatus, dirty: boolean): string {
  switch (status) {
    case 'saving':
      return 'Saving…'
    case 'error':
      return 'Save failed'
    case 'saved':
      return 'Saved'
    case 'idle':
      return dirty ? 'Unsaved changes' : ''
  }
}
