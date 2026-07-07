import { describe, it, expect } from 'vitest'
import { move } from '../src/shared/reorder'

/**
 * Unit tests for the pure array-reordering logic that backs drag-and-drop
 * reordering of cards (`reorderCards`) and snippets (`reorderSnippets`).
 *
 * These cover the same `move()` helper both store actions delegate to, so the
 * index math is verified independently of React / the DOM.
 */
describe('move (reorder array logic)', () => {
  it('moves an item forward (earlier index -> later index)', () => {
    expect(move(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backward (later index -> earlier index)', () => {
    expect(move(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves an item to the very end', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item to the very front', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op when from === to and returns the same reference', () => {
    const input = ['a', 'b', 'c']
    const result = move(input, 1, 1)
    expect(result).toBe(input)
  })

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c', 'd']
    const snapshot = [...input]
    move(input, 0, 3)
    expect(input).toEqual(snapshot)
  })

  it('returns a new array reference on a real move', () => {
    const input = ['a', 'b', 'c']
    const result = move(input, 0, 1)
    expect(result).not.toBe(input)
    expect(result).toEqual(['b', 'a', 'c'])
  })

  it('clamps out-of-range indices instead of creating holes', () => {
    // to beyond the end clamps to the last slot
    expect(move(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    // negative from clamps to the first slot
    expect(move(['a', 'b', 'c'], -5, 2)).toEqual(['b', 'c', 'a'])
    // no undefined values ever appear
    expect(move(['a', 'b', 'c'], 10, -10)).not.toContain(undefined)
  })

  it('returns the same reference for arrays too small to reorder', () => {
    const empty: string[] = []
    expect(move(empty, 0, 0)).toBe(empty)
    const single = ['only']
    expect(move(single, 0, 5)).toBe(single)
  })

  it('preserves length and membership across a move', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = move(input, 4, 0)
    expect(result).toHaveLength(input.length)
    expect([...result].sort()).toEqual([...input].sort())
  })

  it('works with object items by moving references (not copies)', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    const c = { id: 'c' }
    const result = move([a, b, c], 2, 0)
    expect(result).toEqual([c, a, b])
    expect(result[0]).toBe(c)
  })
})
