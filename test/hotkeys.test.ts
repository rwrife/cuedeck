import { describe, it, expect } from 'vitest'
import {
  SNIPPET_HOTKEYS,
  snippetIndexForKey,
  snippetForKey,
  cardStepForKey,
  nextCardId,
  isTypingTarget
} from '../src/shared/hotkeys'

describe('hotkeys: snippet key mapping', () => {
  it('maps "1".."9" to zero-based indices 0..8', () => {
    SNIPPET_HOTKEYS.forEach((key, i) => {
      expect(snippetIndexForKey(key)).toBe(i)
    })
  })

  it('returns null for non-snippet keys', () => {
    for (const key of ['0', 'a', 'Enter', 'ArrowLeft', '', '10']) {
      expect(snippetIndexForKey(key)).toBeNull()
    }
  })

  it('resolves the correct snippet from an ordered list', () => {
    const snippets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(snippetForKey('1', snippets)).toEqual({ id: 'a' })
    expect(snippetForKey('2', snippets)).toEqual({ id: 'b' })
    expect(snippetForKey('3', snippets)).toEqual({ id: 'c' })
  })

  it('returns null when the key points past the end of the list', () => {
    const snippets = [{ id: 'a' }, { id: 'b' }]
    expect(snippetForKey('3', snippets)).toBeNull()
    expect(snippetForKey('9', snippets)).toBeNull()
  })

  it('returns null for an empty snippet list', () => {
    expect(snippetForKey('1', [])).toBeNull()
  })
})

describe('hotkeys: card navigation', () => {
  it('maps arrow keys to a step, null otherwise', () => {
    expect(cardStepForKey('ArrowLeft')).toBe(-1)
    expect(cardStepForKey('ArrowRight')).toBe(1)
    expect(cardStepForKey('ArrowUp')).toBeNull()
    expect(cardStepForKey('x')).toBeNull()
  })

  const cards = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]

  it('steps to the next/previous card', () => {
    expect(nextCardId('c1', cards, 1)).toBe('c2')
    expect(nextCardId('c2', cards, 1)).toBe('c3')
    expect(nextCardId('c2', cards, -1)).toBe('c1')
  })

  it('clamps at the ends of the running order', () => {
    expect(nextCardId('c3', cards, 1)).toBe('c3')
    expect(nextCardId('c1', cards, -1)).toBe('c1')
  })

  it('handles empty lists and unknown active ids', () => {
    expect(nextCardId('c1', [], 1)).toBeNull()
    // Unknown active id: step is applied from the first card.
    expect(nextCardId('nope', cards, 1)).toBe('c2')
    expect(nextCardId(null, cards, -1)).toBe('c1')
  })
})

describe('hotkeys: typing-target detection', () => {
  it('treats textareas and text inputs as typing', () => {
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true) // defaults to text
    expect(isTypingTarget({ tagName: 'input', type: 'search' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('treats contenteditable elements as typing', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('does not treat non-text inputs or plain elements as typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'button' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
