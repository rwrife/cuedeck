import { describe, expect, it } from 'vitest'
import {
  errorMessageOf,
  makeOperationError,
  type DeckOperation
} from '../src/shared/operations'

describe('operation error model', () => {
  it('builds a structured error tagged with its operation and a timestamp', () => {
    const err = makeOperationError('save', 'disk full', 'ts-1')
    expect(err).toEqual({ operation: 'save', message: 'disk full', at: 'ts-1' })
  })

  it('stamps an ISO timestamp when none is supplied', () => {
    const err = makeOperationError('export', 'nope')
    expect(() => new Date(err.at).toISOString()).not.toThrow()
    expect(new Date(err.at).toISOString()).toBe(err.at)
  })

  it('covers every user-facing operation surface', () => {
    const ops: DeckOperation[] = ['create', 'open', 'save', 'import', 'export', 'live']
    for (const op of ops) {
      expect(makeOperationError(op, 'x').operation).toBe(op)
    }
  })
})

describe('errorMessageOf', () => {
  it('unwraps an Error instance message', () => {
    expect(errorMessageOf(new Error('boom'))).toBe('boom')
  })

  it('passes through a plain string', () => {
    expect(errorMessageOf('raw')).toBe('raw')
  })

  it('falls back to a generic message for opaque values', () => {
    expect(errorMessageOf(undefined)).toBe('Something went wrong.')
    expect(errorMessageOf({ weird: true })).toBe('Something went wrong.')
  })
})
