/**
 * Pure, Electron-runtime-free window chrome helpers for the main process.
 *
 * These functions only compute plain data (a background color string, a menu
 * template) and never touch a live `BrowserWindow`, `app`, or `Menu` instance,
 * so they can be unit-tested directly in the Vitest Node environment without
 * bootstrapping Electron. `src/main/index.ts` is the thin, untested-by-design
 * edge that feeds their output into the real Electron APIs.
 */
import type { MenuItemConstructorOptions } from 'electron'
import type { ResolvedTheme } from '../shared/settings'

/**
 * Startup background color for the main window, matched to the resolved
 * theme so there's no light-on-dark (or dark-on-light) flash before the
 * renderer paints its own themed surfaces.
 */
export function resolveWindowBackgroundColor(theme: ResolvedTheme): string {
  return theme === 'light' ? '#f5f6f8' : '#0f1117'
}

/**
 * Build the application menu template for `platform`, or `null` to remove the
 * menu bar entirely.
 *
 * CueDeck has no document-based File menu, no in-app View/zoom commands, and
 * no Help content beyond what's already reachable from Settings, so the
 * generic Electron default menu (File/Edit/View/Window/Help) is pure clutter.
 *
 * - Windows and Linux: no menu bar at all (`null`) — those platforms don't
 *   need one for a single-window utility app, and removing it also removes
 *   the unused Alt-key mnemonic overlay.
 * - macOS: users expect *some* menu bar, and macOS text inputs rely on the
 *   `editMenu` role for native Cut/Copy/Paste/Select All/Undo/Redo keyboard
 *   behavior, so a fully empty menu is not conventional or usable there. Keep
 *   just the three roles that are load-bearing — `appMenu` (About/Hide/Quit),
 *   `editMenu`, and `windowMenu` (Minimize/Zoom/Cmd+`) — and drop the generic
 *   File/View/Help menus that don't apply to CueDeck.
 */
export function buildApplicationMenuTemplate(
  platform: NodeJS.Platform
): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null

  return [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]
}
