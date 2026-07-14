import { describe, expect, it } from 'vitest'
import { buildApplicationMenuTemplate, resolveWindowBackgroundColor } from '../src/main/windowChrome'

describe('windowChrome: resolveWindowBackgroundColor', () => {
  it('returns the light card color for the light theme', () => {
    expect(resolveWindowBackgroundColor('light')).toBe('#f5f6f8')
  })

  it('returns the dark app background color for the dark theme', () => {
    expect(resolveWindowBackgroundColor('dark')).toBe('#0f1117')
  })
})

describe('windowChrome: buildApplicationMenuTemplate', () => {
  it('removes the default menu entirely on Windows', () => {
    expect(buildApplicationMenuTemplate('win32')).toBeNull()
  })

  it('removes the default menu entirely on Linux', () => {
    expect(buildApplicationMenuTemplate('linux')).toBeNull()
  })

  it('keeps a minimal, conventional menu on macOS', () => {
    const template = buildApplicationMenuTemplate('darwin')
    expect(template).not.toBeNull()
    expect(template?.map((item) => item.role)).toEqual(['appMenu', 'editMenu', 'windowMenu'])
  })

  it('does not include generic File/View/Help chrome on macOS', () => {
    const template = buildApplicationMenuTemplate('darwin')
    const roles = template?.map((item) => item.role) ?? []
    expect(roles).not.toContain('fileMenu')
    expect(roles).not.toContain('viewMenu')
    expect(roles).not.toContain('help')
  })
})
