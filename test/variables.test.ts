import { describe, it, expect } from 'vitest'
import {
  MISSING_VARIABLE_MARKER,
  VARIABLE_NAME_PATTERN,
  classifyVariables,
  collectReferencedVariables,
  extractVariableNames,
  hasVariables,
  renderSnippet,
  validateVariableName
} from '../src/shared/variables'

/**
 * Snippet variable substitution engine (#7). Covers the happy path, the
 * documented missing-variable behavior (visible marker, no prompt), edge cases
 * around what does and doesn't count as a placeholder, and the helpers the
 * editor uses to surface referenced variables.
 */

describe('renderSnippet — substitution', () => {
  it('replaces a single placeholder with its value', () => {
    expect(renderSnippet('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('replaces multiple and repeated placeholders', () => {
    const out = renderSnippet('{{a}}-{{b}}-{{a}}', { a: '1', b: '2' })
    expect(out).toBe('1-2-1')
  })

  it('tolerates inner whitespace: {{ name }} === {{name}}', () => {
    expect(renderSnippet('{{ name }} and {{name}}', { name: 'x' })).toBe('x and x')
  })

  it('supports realistic key characters (dot, dash, digits, underscore)', () => {
    const vars = { 'order.id': '42', 'env-url': 'https://x', order_2: 'two' }
    expect(renderSnippet('{{order.id}} {{env-url}} {{order_2}}', vars)).toBe(
      '42 https://x two'
    )
  })

  it('returns content unchanged when it has no placeholders', () => {
    expect(renderSnippet('plain text', { a: '1' })).toBe('plain text')
  })

  it('handles empty content and undefined vars', () => {
    expect(renderSnippet('', { a: '1' })).toBe('')
    expect(renderSnippet('{{a}}', undefined)).toBe(MISSING_VARIABLE_MARKER('a'))
  })
})

describe('renderSnippet — missing-variable behavior (documented choice)', () => {
  it('flags a missing variable with the visible marker rather than prompting', () => {
    expect(renderSnippet('Hi {{name}}', {})).toBe(`Hi ${MISSING_VARIABLE_MARKER('name')}`)
    // The default marker is the ⟦name⟧ form.
    expect(MISSING_VARIABLE_MARKER('name')).toBe('\u27E6name\u27E7')
  })

  it('treats an empty or whitespace-only value as missing', () => {
    expect(renderSnippet('{{a}}', { a: '' })).toBe(MISSING_VARIABLE_MARKER('a'))
    expect(renderSnippet('{{a}}', { a: '   ' })).toBe(MISSING_VARIABLE_MARKER('a'))
  })

  it('never leaves a raw {{token}} on the output for a referenced variable', () => {
    const out = renderSnippet('{{known}} {{unknown}}', { known: 'ok' })
    expect(out).toBe(`ok ${MISSING_VARIABLE_MARKER('unknown')}`)
    expect(out).not.toContain('{{')
  })

  it('supports a custom onMissing renderer (e.g. keep the raw token)', () => {
    const out = renderSnippet('{{a}}', {}, { onMissing: (n) => `{{${n}}}` })
    expect(out).toBe('{{a}}')
  })
})

describe('renderSnippet — non-placeholders are left intact', () => {
  it('ignores empty or whitespace-only braces', () => {
    expect(renderSnippet('{{}} {{   }}', { '': 'x' })).toBe('{{}} {{   }}')
  })

  it('ignores names with spaces or illegal characters', () => {
    expect(renderSnippet('{{a b}} {{a/b}} {{a:b}}', {})).toBe('{{a b}} {{a/b}} {{a:b}}')
  })

  it('leaves single braces and unmatched delimiters alone', () => {
    expect(renderSnippet('{a} {{a} a}} { {{ }}', { a: 'X' })).toBe('{a} {{a} a}} { {{ }}')
  })

  it('does not recursively substitute a value that itself looks like a token', () => {
    // {{a}} -> "{{b}}"; the injected text is NOT re-scanned, so {{b}} survives.
    expect(renderSnippet('{{a}}', { a: '{{b}}', b: 'nope' })).toBe('{{b}}')
  })
})

describe('extractVariableNames', () => {
  it('returns distinct names in first-seen order', () => {
    expect(extractVariableNames('{{b}} {{a}} {{b}} {{c}}')).toEqual(['b', 'a', 'c'])
  })

  it('ignores invalid placeholders', () => {
    expect(extractVariableNames('{{ok}} {{not ok}} {{}}')).toEqual(['ok'])
  })

  it('returns [] for empty or placeholder-free content', () => {
    expect(extractVariableNames('')).toEqual([])
    expect(extractVariableNames('no vars here')).toEqual([])
  })

  it('trims inner whitespace when naming', () => {
    expect(extractVariableNames('{{  spaced  }}')).toEqual(['spaced'])
  })
})

describe('hasVariables', () => {
  it('is true only when a valid placeholder exists', () => {
    expect(hasVariables('{{a}}')).toBe(true)
    expect(hasVariables('{{ not valid }}')).toBe(false)
    expect(hasVariables('nope')).toBe(false)
  })
})

describe('classifyVariables', () => {
  it('splits referenced variables into filled vs missing', () => {
    const { used, missing } = classifyVariables('{{a}} {{b}} {{c}}', { a: 'x', b: '' })
    expect(used).toEqual(['a'])
    expect(missing).toEqual(['b', 'c'])
  })

  it('treats undefined vars as everything missing', () => {
    const { used, missing } = classifyVariables('{{a}} {{b}}', undefined)
    expect(used).toEqual([])
    expect(missing).toEqual(['a', 'b'])
  })
})

describe('collectReferencedVariables', () => {
  it('collects distinct names across many contents in first-seen order', () => {
    const names = collectReferencedVariables(['{{a}} {{b}}', 'plain', '{{b}} {{c}}'])
    expect(names).toEqual(['a', 'b', 'c'])
  })

  it('returns [] for an empty list', () => {
    expect(collectReferencedVariables([])).toEqual([])
  })
})

describe('VARIABLE_NAME_PATTERN', () => {
  it('accepts realistic keys and rejects whitespace/illegal ones', () => {
    for (const ok of ['email', 'order.id', 'env-url', 'order_2', 'A1']) {
      expect(VARIABLE_NAME_PATTERN.test(ok)).toBe(true)
    }
    for (const bad of ['', 'a b', 'a/b', 'a:b', '{{x}}']) {
      expect(VARIABLE_NAME_PATTERN.test(bad)).toBe(false)
    }
  })

  describe('validateVariableName (#38)', () => {
    it('accepts valid names', () => {
      expect(validateVariableName('orderId').ok).toBe(true)
      expect(validateVariableName('  test.email  ').ok).toBe(true)
      expect(validateVariableName('env-url').ok).toBe(true)
    })

    it('rejects blank names with guidance', () => {
      const r = validateVariableName('   ')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/empty/i)
    })

    it('rejects illegal characters with guidance', () => {
      const r = validateVariableName('a b')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/letters|spaces/i)
    })

    it('rejects collisions with the offending name', () => {
      const r = validateVariableName('foo', ['foo', 'bar'])
      expect(r.ok).toBe(false)
      expect(r.reason).toContain('foo')
      expect(r.reason).toMatch(/exists/i)
    })

    it('allows renaming a key to itself', () => {
      expect(validateVariableName('foo', ['foo', 'bar'], 'foo').ok).toBe(true)
    })

    it('still catches collisions when renaming to a different existing key', () => {
      expect(validateVariableName('bar', ['foo', 'bar'], 'foo').ok).toBe(false)
    })
  })
})
