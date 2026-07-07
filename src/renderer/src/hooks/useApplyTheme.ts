import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { fontScale, resolveTheme } from '@shared/settings'

/**
 * Apply the current settings to the document (#8).
 *
 * Responsibilities:
 *  - Resolve the theme preference (`dark` | `light` | `system`) to a concrete
 *    theme, consulting the live OS color-scheme via `matchMedia` when the
 *    preference is `system`, and re-resolving whenever the OS preference flips.
 *  - Reflect the resolved theme onto <html> as both `data-theme="dark|light"`
 *    (the attribute the CSS tokens key off) and the `.dark` class (so Tailwind's
 *    class-based `dark:` variant is available if needed).
 *  - Set the `--deck-font-scale` custom property from the font-size preference,
 *    which nudges the presenter/notes typography.
 *
 * This is intentionally the single place that touches the DOM for theming; the
 * decision logic itself is the pure, unit-tested {@link resolveTheme}.
 */
export function useApplyTheme(): void {
  const theme = useSettingsStore((s) => s.settings.theme)
  const fontSize = useSettingsStore((s) => s.settings.fontSize)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    function apply(): void {
      const resolved = resolveTheme(theme, media.matches)
      root.dataset.theme = resolved
      root.classList.toggle('dark', resolved === 'dark')
    }

    apply()

    // Only the `system` preference depends on the OS; subscribe just then so we
    // live-update when the user flips their OS between light and dark.
    if (theme !== 'system') return
    // addEventListener('change') is supported in Electron's Chromium; the
    // addListener fallback covers older engines.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    media.addListener(apply)
    return () => media.removeListener(apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--deck-font-scale', String(fontScale(fontSize)))
  }, [fontSize])
}
