import { describe, expect, it } from 'vitest'
import {
  initialSaveState,
  isUnsaved,
  markDirty,
  markError,
  markSaved,
  markSaving,
  needsFlush,
  saveStatusLabel,
  type SaveState
} from '../src/shared/saveStatus'

describe('saveStatus', () => {
  it('starts clean', () => {
    expect(initialSaveState).toEqual({ status: 'saved', error: null })
    expect(isUnsaved(initialSaveState)).toBe(false)
    expect(needsFlush(initialSaveState)).toBe(false)
  })

  it('an edit marks the deck pending and clears any prior error', () => {
    const errored = markError('disk full')
    const dirty = markDirty(errored)
    expect(dirty).toEqual({ status: 'pending', error: null })
    expect(isUnsaved(dirty)).toBe(true)
    expect(needsFlush(dirty)).toBe(true)
  })

  it('a successful save with no new edits returns to saved', () => {
    const saved = markSaved(false)
    expect(saved).toEqual({ status: 'saved', error: null })
    expect(isUnsaved(saved)).toBe(false)
  })

  it('a successful save that raced a new edit stays pending', () => {
    const saved = markSaved(true)
    expect(saved.status).toBe('pending')
    expect(isUnsaved(saved)).toBe(true)
  })

  it('a failed save is NEVER shown as saved', () => {
    const err = markError('EACCES')
    expect(err.status).toBe('error')
    expect(err.error).toBe('EACCES')
    expect(isUnsaved(err)).toBe(true)
    expect(needsFlush(err)).toBe(true)
    // The label must not read "Saved".
    expect(saveStatusLabel(err)).not.toMatch(/^Saved$/)
    expect(saveStatusLabel(err)).toContain('Not saved')
  })

  it('empty error messages fall back to a generic message', () => {
    expect(markError('').error).toBe('Save failed.')
  })

  it('saving transition clears errors', () => {
    expect(markSaving()).toEqual({ status: 'saving', error: null })
  })

  it('labels are distinct, word-based, and color-independent', () => {
    const states: SaveState[] = [
      { status: 'saved', error: null },
      { status: 'pending', error: null },
      { status: 'saving', error: null },
      { status: 'error', error: 'nope' }
    ]
    const labels = states.map(saveStatusLabel)
    expect(new Set(labels).size).toBe(labels.length)
    for (const l of labels) expect(l.length).toBeGreaterThan(0)
  })
})
