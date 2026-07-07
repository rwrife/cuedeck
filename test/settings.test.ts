import { describe, it, expect } from 'vitest'
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SETTINGS,
  FONT_SCALE,
  FONT_SIZES,
  THEME_PREFERENCES,
  fontScale,
  isFontSize,
  isThemePreference,
  mergeSettings,
  normalizeSettings,
  resolveTheme,
  type Settings
} from '../src/shared/settings'

describe('settings: defaults', () => {
  it('are complete and stamped with the current version', () => {
    // Every field on the Settings interface is present.
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(
      ['alwaysOnTopDefault', 'copyFlash', 'copySound', 'fontSize', 'theme', 'version'].sort()
    )
    expect(DEFAULT_SETTINGS.version).toBe(CURRENT_SETTINGS_VERSION)
  })

  it('preserve the original dark-first experience', () => {
    // Defaults must not surprise existing users on first upgrade.
    expect(DEFAULT_SETTINGS.theme).toBe('system')
    expect(DEFAULT_SETTINGS.copyFlash).toBe(true)
    expect(DEFAULT_SETTINGS.alwaysOnTopDefault).toBe(true)
  })
})

describe('settings: type guards', () => {
  it('accept only valid theme preferences', () => {
    for (const t of THEME_PREFERENCES) expect(isThemePreference(t)).toBe(true)
    for (const bad of ['DARK', 'blue', '', 'systems', 1, null, undefined, {}]) {
      expect(isThemePreference(bad)).toBe(false)
    }
  })

  it('accept only valid font sizes', () => {
    for (const f of FONT_SIZES) expect(isFontSize(f)).toBe(true)
    for (const bad of ['tiny', 'MEDIUM', '', 0, null, undefined, []]) {
      expect(isFontSize(bad)).toBe(false)
    }
  })
})

describe('settings: normalizeSettings', () => {
  it('returns the defaults for empty / non-object input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and repairs invalid ones from defaults', () => {
    const result = normalizeSettings({
      theme: 'light',
      fontSize: 'nonsense',
      copyFlash: false,
      copySound: 'yes', // invalid → default
      alwaysOnTopDefault: false,
      version: 999
    })
    expect(result).toEqual({
      theme: 'light',
      fontSize: DEFAULT_SETTINGS.fontSize, // repaired
      copyFlash: false,
      copySound: DEFAULT_SETTINGS.copySound, // repaired (non-boolean)
      alwaysOnTopDefault: false,
      version: CURRENT_SETTINGS_VERSION // always re-stamped
    })
  })

  it('fills gaps from a supplied base rather than defaults', () => {
    const base: Settings = {
      theme: 'light',
      fontSize: 'large',
      copyFlash: false,
      copySound: true,
      alwaysOnTopDefault: false,
      version: CURRENT_SETTINGS_VERSION
    }
    // Only theme provided → every other field comes from base, not DEFAULT.
    expect(normalizeSettings({ theme: 'dark' }, base)).toEqual({ ...base, theme: 'dark' })
  })

  it('always re-stamps the current version even if omitted or wrong', () => {
    expect(normalizeSettings({ theme: 'dark' }).version).toBe(CURRENT_SETTINGS_VERSION)
    expect(normalizeSettings({ version: -5 }).version).toBe(CURRENT_SETTINGS_VERSION)
  })

  it('does not mutate the DEFAULT_SETTINGS singleton', () => {
    const snapshot = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    normalizeSettings({ theme: 'light', copyFlash: false })
    expect(DEFAULT_SETTINGS).toEqual(snapshot)
  })
})

describe('settings: mergeSettings', () => {
  const current: Settings = {
    theme: 'dark',
    fontSize: 'medium',
    copyFlash: true,
    copySound: false,
    alwaysOnTopDefault: true,
    version: CURRENT_SETTINGS_VERSION
  }

  it('applies a valid partial patch onto the current settings', () => {
    expect(mergeSettings(current, { theme: 'light' })).toEqual({ ...current, theme: 'light' })
    expect(mergeSettings(current, { fontSize: 'large', copySound: true })).toEqual({
      ...current,
      fontSize: 'large',
      copySound: true
    })
  })

  it('ignores invalid fields in the patch, keeping the current value', () => {
    const merged = mergeSettings(current, {
      // @ts-expect-error deliberately invalid to prove runtime validation
      theme: 'chartreuse',
      copyFlash: false
    })
    expect(merged.theme).toBe('dark') // unchanged
    expect(merged.copyFlash).toBe(false) // valid change applied
  })

  it('is a no-op for an empty patch', () => {
    expect(mergeSettings(current, {})).toEqual(current)
  })
})

describe('settings: resolveTheme', () => {
  it('maps explicit themes straight through, ignoring the OS', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('follows the OS preference for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('settings: font scale', () => {
  it('has a positive multiplier for every font size, medium being the 1x baseline', () => {
    for (const size of FONT_SIZES) expect(FONT_SCALE[size]).toBeGreaterThan(0)
    expect(FONT_SCALE.medium).toBe(1)
    expect(FONT_SCALE.small).toBeLessThan(1)
    expect(FONT_SCALE.large).toBeGreaterThan(1)
  })

  it('fontScale() returns the matching multiplier', () => {
    expect(fontScale('small')).toBe(FONT_SCALE.small)
    expect(fontScale('medium')).toBe(1)
    expect(fontScale('large')).toBe(FONT_SCALE.large)
  })
})
