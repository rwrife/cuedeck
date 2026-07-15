import { describe, it, expect } from 'vitest'
import {
  WORKSPACE_MODES,
  isModeAvailable,
  modeAfterCloseDeck,
  modeAfterEnterPresent,
  modeAfterExitPresent,
  modeAfterOpenDeck,
  primaryActionMode,
  requiresOpenDeck,
  resolveModeSelection
} from '../src/shared/workspace'

describe('workspace: mode list', () => {
  it('defines the four Studio modes in Library → Build → Rehearse → Present order', () => {
    expect(WORKSPACE_MODES).toEqual(['library', 'build', 'rehearse', 'present'])
  })
})

describe('workspace: requiresOpenDeck', () => {
  it('Library never requires an open deck', () => {
    expect(requiresOpenDeck('library')).toBe(false)
  })

  it('Build, Rehearse, and Present all require an open deck', () => {
    expect(requiresOpenDeck('build')).toBe(true)
    expect(requiresOpenDeck('rehearse')).toBe(true)
    expect(requiresOpenDeck('present')).toBe(true)
  })
})

describe('workspace: isModeAvailable', () => {
  it('Library is available with or without an open deck', () => {
    expect(isModeAvailable('library', false)).toBe(true)
    expect(isModeAvailable('library', true)).toBe(true)
  })

  it('Build/Rehearse/Present are unavailable without an open deck', () => {
    expect(isModeAvailable('build', false)).toBe(false)
    expect(isModeAvailable('rehearse', false)).toBe(false)
    expect(isModeAvailable('present', false)).toBe(false)
  })

  it('Build/Rehearse/Present become available once a deck is open', () => {
    expect(isModeAvailable('build', true)).toBe(true)
    expect(isModeAvailable('rehearse', true)).toBe(true)
    expect(isModeAvailable('present', true)).toBe(true)
  })
})

describe('workspace: resolveModeSelection (mode-rail navigation guard)', () => {
  it('switches to the requested mode when it is available', () => {
    expect(resolveModeSelection('build', 'library', true)).toBe('build')
  })

  it('stays on the current mode when the target requires a deck that is not open', () => {
    expect(resolveModeSelection('build', 'library', false)).toBe('library')
    expect(resolveModeSelection('present', 'build', false)).toBe('build')
  })

  it('always allows switching to Library regardless of deck state', () => {
    expect(resolveModeSelection('library', 'build', true)).toBe('library')
    expect(resolveModeSelection('library', 'build', false)).toBe('library')
  })
})

describe('workspace: modeAfterOpenDeck / modeAfterCloseDeck', () => {
  it('opening or creating a deck lands on Build', () => {
    expect(modeAfterOpenDeck()).toBe('build')
  })

  it('closing the active deck returns to Library', () => {
    expect(modeAfterCloseDeck()).toBe('library')
  })
})

describe('workspace: modeAfterEnterPresent', () => {
  it('enters Present when a deck is open', () => {
    expect(modeAfterEnterPresent('rehearse', true)).toBe('present')
    expect(modeAfterEnterPresent('build', true)).toBe('present')
  })

  it('is a no-op without an open deck', () => {
    expect(modeAfterEnterPresent('library', false)).toBe('library')
  })
})

describe('workspace: modeAfterExitPresent', () => {
  it('returns to Rehearse when currently presenting', () => {
    expect(modeAfterExitPresent('present')).toBe('rehearse')
  })

  it('is a no-op when not currently presenting', () => {
    expect(modeAfterExitPresent('build')).toBe('build')
    expect(modeAfterExitPresent('library')).toBe('library')
  })
})

describe('workspace: primaryActionMode (one clear next action per mode)', () => {
  it('Build’s primary next action is Rehearse', () => {
    expect(primaryActionMode('build')).toBe('rehearse')
  })

  it('Rehearse’s primary next action is Present', () => {
    expect(primaryActionMode('rehearse')).toBe('present')
  })

  it('Library and Present have no single next-mode action', () => {
    expect(primaryActionMode('library')).toBeNull()
    expect(primaryActionMode('present')).toBeNull()
  })
})
