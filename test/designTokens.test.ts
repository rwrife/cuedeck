import { describe, it, expect } from 'vitest'
import {
  STATUS_TONES,
  INTERACTION_STATES,
  RADII,
  SPACING,
  statusColorVar,
  statusSurfaceVar,
  FOCUS_RING_CLASS
} from '../src/shared/designTokens'

describe('design tokens', () => {
  it('defines the full status and interaction vocabularies', () => {
    expect(STATUS_TONES).toContain('success')
    expect(STATUS_TONES).toContain('error')
    expect(INTERACTION_STATES).toEqual([
      'default',
      'hover',
      'pressed',
      'focus',
      'disabled'
    ])
  })

  it('maps status tones to their CSS custom properties', () => {
    expect(statusColorVar('warning')).toBe('var(--deck-status-warning)')
    expect(statusSurfaceVar('info')).toBe('var(--deck-status-info-surface)')
  })

  it('exposes a monotonically increasing radius scale', () => {
    expect(RADII.sm).toBeLessThan(RADII.md)
    expect(RADII.md).toBeLessThan(RADII.lg)
    expect(RADII.pill).toBeGreaterThan(RADII.xl)
  })

  it('spacing follows a 4px grid', () => {
    for (const v of Object.values(SPACING)) {
      expect(v % 4).toBe(0)
    }
  })

  it('provides a single focus-ring recipe', () => {
    expect(FOCUS_RING_CLASS).toContain('focus-visible:ring-2')
    expect(FOCUS_RING_CLASS).toContain('ring-deck-accent')
  })
})
