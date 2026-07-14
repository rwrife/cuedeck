import { describe, it, expect } from 'vitest'
import {
  WORKSPACE_MODES,
  WORKSPACE_MODE_INFO,
  canEnterMode,
  isDeckSpecificMode,
  modeAfterCloseDeck,
  modeAfterExitPresent,
  modeAfterOpenDeck,
  resolveModeRequest,
  windowModeFor
} from '../src/shared/workspace'

describe('workspace: mode vocabulary', () => {
  it('lists the four Studio modes in rail order', () => {
    expect(WORKSPACE_MODES).toEqual(['library', 'build', 'rehearse', 'present'])
  })

  it('has matching, ordered metadata for every mode', () => {
    expect(WORKSPACE_MODE_INFO.map((i) => i.mode)).toEqual([...WORKSPACE_MODES])
    for (const info of WORKSPACE_MODE_INFO) {
      expect(info.label.length).toBeGreaterThan(0)
      expect(info.hint.length).toBeGreaterThan(0)
    }
  })

  it('marks only Library as always-available', () => {
    expect(isDeckSpecificMode('library')).toBe(false)
    expect(isDeckSpecificMode('build')).toBe(true)
    expect(isDeckSpecificMode('rehearse')).toBe(true)
    expect(isDeckSpecificMode('present')).toBe(true)
    // Metadata agrees.
    for (const info of WORKSPACE_MODE_INFO) {
      expect(info.deckSpecific).toBe(isDeckSpecificMode(info.mode))
    }
  })
})

describe('workspace: entry guards', () => {
  it('always allows the Library', () => {
    expect(canEnterMode('library', false)).toBe(true)
    expect(canEnterMode('library', true)).toBe(true)
  })

  it('gates deck-specific modes behind an open deck', () => {
    for (const mode of ['build', 'rehearse', 'present'] as const) {
      expect(canEnterMode(mode, false)).toBe(false)
      expect(canEnterMode(mode, true)).toBe(true)
    }
  })

  it('collapses illegal requests back to the Library', () => {
    expect(resolveModeRequest('build', false)).toBe('library')
    expect(resolveModeRequest('present', false)).toBe('library')
    expect(resolveModeRequest('build', true)).toBe('build')
    expect(resolveModeRequest('library', false)).toBe('library')
  })
})

describe('workspace: lifecycle transitions', () => {
  it('opening a deck lands in Build', () => {
    expect(modeAfterOpenDeck()).toBe('build')
  })

  it('closing a deck returns to Library', () => {
    expect(modeAfterCloseDeck()).toBe('library')
  })

  it('exiting Present returns to Rehearse', () => {
    expect(modeAfterExitPresent()).toBe('rehearse')
  })
})

describe('workspace: window mode mapping', () => {
  it('only Present uses the compact presenter window', () => {
    expect(windowModeFor('present')).toBe('present')
    expect(windowModeFor('library')).toBe('edit')
    expect(windowModeFor('build')).toBe('edit')
    expect(windowModeFor('rehearse')).toBe('edit')
  })
})
