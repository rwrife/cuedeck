import { describe, expect, it } from 'vitest'
import { saveStatusLabel } from '../src/renderer/src/lib/ui/saveStatusLabel'

describe('saveStatusLabel', () => {
  it('reports an in-flight write', () => {
    expect(saveStatusLabel('saving', true)).toBe('Saving…')
  })

  it('reports a failure distinctly (never as saved)', () => {
    expect(saveStatusLabel('error', true)).toBe('Save failed')
  })

  it('reports unsaved edits when idle but dirty', () => {
    expect(saveStatusLabel('idle', true)).toBe('Unsaved changes')
  })

  it('reports saved when persisted and clean', () => {
    expect(saveStatusLabel('saved', false)).toBe('Saved')
  })

  it('shows nothing for a clean idle deck with no history', () => {
    expect(saveStatusLabel('idle', false)).toBe('')
  })
})
