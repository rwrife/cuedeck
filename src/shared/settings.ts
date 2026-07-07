/**
 * Shared, dependency-free settings model for CueDeck (#8).
 *
 * Like the rest of `src/shared`, this module is pure data/string logic with no
 * DOM, Electron, or React dependency, so it can be unit-tested in the plain Node
 * test environment and reused identically by the main process (persistence via
 * `settings.json` in `userData`) and the renderer (applying the theme, font
 * size, and behavior toggles). Keeping the type + defaults + normalization here
 * means the two processes can't drift on what a valid settings object looks
 * like — the same way the deck model lives in `types.ts` / `deck.ts`.
 *
 * ## What settings cover
 *
 * - {@link Settings.theme}: `dark` | `light` | `system`. `system` follows the OS
 *   color-scheme preference at render time (see {@link resolveTheme}).
 * - {@link Settings.fontSize}: presenter/notes font scale (`small` | `medium` |
 *   `large`), applied as a multiplier (see {@link FONT_SCALE}).
 * - {@link Settings.copyFlash}: whether the "Copied ✓" flash is shown after a
 *   snippet copy.
 * - {@link Settings.copySound}: whether a subtle sound plays on copy.
 * - {@link Settings.alwaysOnTopDefault}: whether entering Presenter Mode should
 *   pin the window on top by default.
 *
 * ## Forward/backward compatibility
 *
 * Persisted settings are versioned ({@link CURRENT_SETTINGS_VERSION}). Unknown,
 * missing, or malformed fields are repaired field-by-field against
 * {@link DEFAULT_SETTINGS} by {@link normalizeSettings}, so a partial or
 * hand-edited `settings.json` — or one written by a future/older build — always
 * loads into a complete, valid object instead of throwing or losing every
 * preference.
 */

/** Theme preference. `system` defers to the OS color-scheme at render time. */
export type ThemePreference = 'dark' | 'light' | 'system'

/** The concrete theme actually applied to the UI (never `system`). */
export type ResolvedTheme = 'dark' | 'light'

/** Presenter/notes font scale. */
export type FontSize = 'small' | 'medium' | 'large'

/** Allowed theme-preference values, for validation + UI iteration. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system']

/** Allowed font-size values, for validation + UI iteration. */
export const FONT_SIZES: readonly FontSize[] = ['small', 'medium', 'large']

/**
 * User-configurable preferences, persisted across launches as `settings.json`
 * in Electron's `userData` directory. This is the AUTHORITATIVE shape shared by
 * the main and renderer processes.
 */
export interface Settings {
  /** Color theme: `dark` | `light` | `system` (follow OS). */
  theme: ThemePreference
  /** Presenter/notes font scale. */
  fontSize: FontSize
  /** Show the "Copied ✓" flash after copying a snippet. */
  copyFlash: boolean
  /** Play a subtle sound when a snippet is copied. */
  copySound: boolean
  /** Pin the window on top by default when entering Presenter Mode. */
  alwaysOnTopDefault: boolean
  /** Settings schema version for future migrations. */
  version: number
}

/**
 * The current settings schema version emitted by this build. Bumped only when
 * the persisted shape changes in a way that needs migration; new optional
 * fields are handled by {@link normalizeSettings} without a bump.
 */
export const CURRENT_SETTINGS_VERSION = 1

/**
 * Factory-default settings. Chosen to preserve the app's original behavior for
 * existing users (dark theme, copy flash on) so first launch after upgrading is
 * unchanged until the user opts into something else.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 'medium',
  copyFlash: true,
  copySound: false,
  alwaysOnTopDefault: true,
  version: CURRENT_SETTINGS_VERSION
}

/**
 * Font-scale multipliers applied to the presenter/notes surfaces. `medium` is
 * the neutral 1× baseline so existing layouts are unaffected by default.
 */
export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15
}

/** Type guard: is `v` a valid {@link ThemePreference}? */
export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === 'string' && (THEME_PREFERENCES as readonly string[]).includes(v)
}

/** Type guard: is `v` a valid {@link FontSize}? */
export function isFontSize(v: unknown): v is FontSize {
  return typeof v === 'string' && (FONT_SIZES as readonly string[]).includes(v)
}

/** Coerce an unknown to a boolean, falling back to `fallback` for non-booleans. */
function coerceBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Repair arbitrary input into a complete, valid {@link Settings} object.
 *
 * Every field is validated independently and falls back to its
 * {@link DEFAULT_SETTINGS} value when missing or malformed, so a partial patch,
 * a hand-edited file, or a settings blob from another build never throws and
 * never wipes unrelated preferences. The result is always stamped with
 * {@link CURRENT_SETTINGS_VERSION}.
 *
 * @param input possibly-partial / untrusted settings (e.g. parsed JSON or an
 *   IPC `set` payload).
 * @param base the object to fill gaps from; defaults to {@link DEFAULT_SETTINGS}
 *   but callers merging a patch onto existing settings pass the current object.
 */
export function normalizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    theme: isThemePreference(src.theme) ? src.theme : base.theme,
    fontSize: isFontSize(src.fontSize) ? src.fontSize : base.fontSize,
    copyFlash: coerceBoolean(src.copyFlash, base.copyFlash),
    copySound: coerceBoolean(src.copySound, base.copySound),
    alwaysOnTopDefault: coerceBoolean(src.alwaysOnTopDefault, base.alwaysOnTopDefault),
    version: CURRENT_SETTINGS_VERSION
  }
}

/**
 * Merge a partial patch onto an existing settings object, validating each
 * changed field. Unspecified (or invalid) fields keep their current value. Used
 * by the `settings:set` IPC path so the renderer can send just the field(s) the
 * user changed.
 */
export function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  return normalizeSettings({ ...current, ...patch }, current)
}

/**
 * Resolve a theme *preference* into the concrete theme to apply.
 *
 * `dark`/`light` map straight through. `system` consults `systemPrefersDark`
 * (the caller supplies this — from `matchMedia('(prefers-color-scheme: dark)')`
 * in the renderer, or `nativeTheme.shouldUseDarkColors` in main) and returns the
 * matching concrete theme. This keeps the decision pure and testable; the DOM /
 * OS lookup stays at the edges.
 */
export function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light'
  return theme
}

/** The numeric font-scale multiplier for a given font-size preference. */
export function fontScale(size: FontSize): number {
  return FONT_SCALE[size]
}
