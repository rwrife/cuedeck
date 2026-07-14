import { describe, it, expect } from 'vitest'
import {
  buttonClasses,
  BUTTON_VARIANTS,
  BUTTON_SIZES
} from '../src/shared/buttonClasses'
import { FOCUS_RING_CLASS } from '../src/shared/designTokens'

describe('buttonClasses', () => {
  it('defaults to primary/md', () => {
    const cls = buttonClasses()
    expect(cls).toContain('bg-deck-accent')
    expect(cls).toContain('py-2')
  })

  it('always includes the shared focus ring and disabled affordances', () => {
    for (const variant of BUTTON_VARIANTS) {
      const cls = buttonClasses({ variant })
      expect(cls).toContain(FOCUS_RING_CLASS)
      expect(cls).toContain('disabled:cursor-not-allowed')
      expect(cls).toContain('disabled:opacity-50')
    }
  })

  it('renders a distinct pressed (active:) state for every variant', () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonClasses({ variant })).toMatch(/active:/)
    }
  })

  it('renders a hover state for every variant', () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonClasses({ variant })).toMatch(/hover:/)
    }
  })

  it('applies the size scale', () => {
    expect(buttonClasses({ size: 'sm' })).toContain('text-sm')
    expect(buttonClasses({ size: 'lg' })).toContain('text-base')
    for (const size of BUTTON_SIZES) {
      expect(buttonClasses({ size })).toContain('rounded-lg')
    }
  })

  it('appends caller className verbatim and last', () => {
    const cls = buttonClasses({ className: 'w-full custom-x' })
    expect(cls.endsWith('w-full custom-x')).toBe(true)
  })

  it('danger variant uses the error status token', () => {
    expect(buttonClasses({ variant: 'danger' })).toContain('text-deck-status-error')
  })
})
