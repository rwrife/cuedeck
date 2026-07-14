import { describe, it, expect } from 'vitest'
import { ICONS, ICON_NAMES, getIcon } from '../src/shared/icons'

describe('icon registry', () => {
  it('exposes a non-empty, unique name list', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0)
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })

  it('every icon has a body and a default accessible label', () => {
    for (const name of ICON_NAMES) {
      const def = ICONS[name]
      expect(def.body.length).toBeGreaterThan(0)
      expect(def.defaultLabel.trim().length).toBeGreaterThan(0)
    }
  })

  it('every glyph draws with currentColor (theme-inheriting, not emoji)', () => {
    for (const name of ICON_NAMES) {
      // No literal color values baked into the path bodies.
      expect(ICONS[name].body).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    }
  })

  it('contains no emoji code points', () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    for (const name of ICON_NAMES) {
      expect(emoji.test(ICONS[name].body)).toBe(false)
    }
  })

  it('getIcon resolves known names and rejects unknown ones', () => {
    expect(getIcon('settings')).toBe(ICONS.settings)
    // @ts-expect-error unknown icon name is a type error and undefined at runtime
    expect(getIcon('does-not-exist')).toBeUndefined()
  })
})
