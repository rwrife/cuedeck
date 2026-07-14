/**
 * Accessible icon registry (#32).
 *
 * CueDeck previously used bare emoji (⚙ 🔍 📌 🎛 …) for functional navigation and
 * action affordances. Emoji render inconsistently across platforms/fonts, can't
 * inherit color, and are announced unpredictably by screen readers. This module
 * replaces them with a small set of hand-picked, single-color SVG glyphs drawn
 * on a 24×24 grid with `currentColor` strokes, so every icon inherits text color
 * and theme automatically.
 *
 * This file is pure data (path strings) so it can be unit-tested and consumed by
 * the renderer's `<Icon>` primitive without pulling in React here.
 */

export interface IconDef {
  /**
   * SVG child markup (paths, circles…) using stroke="currentColor". The wrapping
   * <svg> with viewBox/stroke defaults is supplied by the <Icon> component.
   */
  readonly body: string
  /** Default accessible label used when a caller doesn't override it. */
  readonly defaultLabel: string
}

/**
 * The finite icon vocabulary. Names are semantic (what the icon *means*), not
 * visual, so the underlying glyph can change without touching call sites.
 */
export const ICONS = {
  settings: {
    defaultLabel: 'Settings',
    body: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  },
  search: {
    defaultLabel: 'Search',
    body: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'
  },
  pin: {
    defaultLabel: 'Pin on top',
    body: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'
  },
  live: {
    defaultLabel: 'Live control',
    body: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>'
  },
  close: {
    defaultLabel: 'Close',
    body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  },
  check: {
    defaultLabel: 'Done',
    body: '<path d="M20 6 9 17l-5-5"/>'
  },
  copy: {
    defaultLabel: 'Copy',
    body: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
  },
  arrowLeft: {
    defaultLabel: 'Previous',
    body: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
  },
  arrowRight: {
    defaultLabel: 'Next',
    body: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  },
  external: {
    defaultLabel: 'Open',
    body: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  },
  warning: {
    defaultLabel: 'Warning',
    body: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
  },
  deck: {
    defaultLabel: 'Decks',
    body: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'
  }
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

/** Look up an icon definition by name. Returns undefined for unknown names. */
export function getIcon(name: IconName): IconDef | undefined {
  return ICONS[name]
}
