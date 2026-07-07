import { create } from 'zustand'
import { DEFAULT_SETTINGS, resolveTheme, type ResolvedTheme, type Settings } from '@shared/settings'

/**
 * Renderer-side settings state (#8).
 *
 * Holds the user preferences loaded from the main process (persisted in
 * settings.json under userData) and exposes an updater that optimistically
 * applies a patch, sends it to main, and reconciles with the authoritative
 * result. Kept separate from the deck store because settings are app-wide and
 * outlive any open deck.
 *
 * Theme *application* (setting `data-theme` / `.dark` on <html> and the
 * `--deck-font-scale` variable) lives in `useApplyTheme`, driven off this
 * store's `settings` plus the live OS color-scheme; this store only owns the
 * data + persistence.
 */
interface SettingsState {
  /** The current, fully-normalized settings. Starts at defaults pre-load. */
  settings: Settings
  /** True until the first successful load from the main process resolves. */
  loaded: boolean

  /** Load settings from the main process (called once at startup). */
  load: () => Promise<void>
  /**
   * Apply a partial settings patch: optimistically update local state, persist
   * via IPC, then reconcile with the authoritative object main returns.
   */
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await window.cuedeck.settings.get()
    set({ settings, loaded: true })
  },

  update: async (patch) => {
    // Optimistic: reflect the change immediately for a snappy UI.
    const optimistic = { ...get().settings, ...patch }
    set({ settings: optimistic })
    // Persist + reconcile with the validated result from main.
    const saved = await window.cuedeck.settings.set(patch)
    set({ settings: saved })
  }
}))

/**
 * Resolve the concrete theme for the current settings against a given OS
 * preference. Thin wrapper over the shared {@link resolveTheme} so components /
 * hooks don't need to import from two places.
 */
export function resolveCurrentTheme(settings: Settings, systemPrefersDark: boolean): ResolvedTheme {
  return resolveTheme(settings.theme, systemPrefersDark)
}
