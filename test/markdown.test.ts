import { describe, it, expect } from 'vitest'
import { escapeHtml, renderInline, renderMarkdown } from '../src/shared/markdown'

/**
 * Tests for the safe Markdown renderer that powers talking-point notes (#6).
 *
 * The suite runs in the repo's default Node environment (no DOM) — the renderer
 * is deliberately a pure string-in/string-out function so it can be verified here
 * without Electron or `jsdom`. The security-critical case (raw HTML / `<script>`
 * never survives as markup) has its own describe block.
 */

describe('markdown: escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<div class="x" data-y=\'z\'>&</div>')).toBe(
      '&lt;div class=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/div&gt;'
    )
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('just some words 123')).toBe('just some words 123')
  })
})

describe('markdown: renderInline', () => {
  it('renders bold with ** and __', () => {
    expect(renderInline('a **bold** b')).toBe('a <strong>bold</strong> b')
    expect(renderInline('a __bold__ b')).toBe('a <strong>bold</strong> b')
  })

  it('renders italic with * and _', () => {
    expect(renderInline('a *em* b')).toBe('a <em>em</em> b')
    expect(renderInline('a _em_ b')).toBe('a <em>em</em> b')
  })

  it('renders inline code and escapes its contents', () => {
    expect(renderInline('run `npm test` now')).toBe('run <code>npm test</code> now')
    expect(renderInline('`<b>&`')).toBe('<code>&lt;b&gt;&amp;</code>')
  })

  it('does not treat emphasis markers inside code spans as emphasis', () => {
    expect(renderInline('`a*b*c`')).toBe('<code>a*b*c</code>')
    expect(renderInline('`__x__`')).toBe('<code>__x__</code>')
  })

  it('prefers bold over italic for doubled markers', () => {
    expect(renderInline('**x**')).toBe('<strong>x</strong>')
  })

  it('nests bold and italic when markers are properly paired', () => {
    expect(renderInline('**_x_**')).toBe('<strong><em>x</em></strong>')
    expect(renderInline('_**x**_')).toBe('<em><strong>x</strong></em>')
    expect(renderInline('**bold** and *it*')).toBe('<strong>bold</strong> and <em>it</em>')
  })

  it('does not create empty emphasis from bare or doubled markers', () => {
    // A lone marker with whitespace should stay literal (escaped) text.
    expect(renderInline('a * b * c')).toBe('a * b * c')
    expect(renderInline('use _ as a spacer')).toBe('use _ as a spacer')
  })

  it('escapes raw HTML in inline text', () => {
    expect(renderInline('<i>hi</i>')).toBe('&lt;i&gt;hi&lt;/i&gt;')
  })
})

describe('markdown: renderMarkdown blocks', () => {
  it('returns an empty string for empty/whitespace input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n\n  ')).toBe('')
  })

  it('renders ATX headings h1..h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>')
    expect(renderMarkdown('### Sub')).toBe('<h3>Sub</h3>')
    expect(renderMarkdown('###### Deep')).toBe('<h6>Deep</h6>')
  })

  it('does not treat 7+ hashes as a heading', () => {
    expect(renderMarkdown('####### too many')).toBe('<p>####### too many</p>')
  })

  it('applies inline formatting inside headings', () => {
    expect(renderMarkdown('# **Bold** title')).toBe('<h1><strong>Bold</strong> title</h1>')
  })

  it('renders unordered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
    expect(renderMarkdown('* a\n+ b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('renders ordered lists', () => {
    expect(renderMarkdown('1. first\n2. second')).toBe(
      '<ol><li>first</li><li>second</li></ol>'
    )
  })

  it('renders GitHub task list checkboxes (unchecked and checked)', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done')
    expect(html).toContain('<ul>')
    expect(html).toContain('<input type="checkbox" disabled />')
    expect(html).toContain('<input type="checkbox" disabled checked />')
    expect(html).toContain('todo')
    expect(html).toContain('done')
    // Checked items are flagged for styling.
    expect(html).toContain('task-checked')
  })

  it('accepts capital X for a checked task', () => {
    expect(renderMarkdown('- [X] done')).toContain('checked')
  })

  it('renders paragraphs and joins soft-wrapped lines with <br>', () => {
    expect(renderMarkdown('hello world')).toBe('<p>hello world</p>')
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>')
  })

  it('separates paragraphs on a blank line', () => {
    expect(renderMarkdown('para one\n\npara two')).toBe('<p>para one</p><p>para two</p>')
  })

  it('handles a realistic mixed document', () => {
    const src = [
      '# Demo Intro',
      '',
      'Say **hello** and open the `dashboard`.',
      '',
      'Steps:',
      '- [ ] Log in',
      '- [x] Show billing',
      '',
      '1. First point',
      '2. Second point'
    ].join('\n')
    const html = renderMarkdown(src)
    expect(html).toContain('<h1>Demo Intro</h1>')
    expect(html).toContain('<strong>hello</strong>')
    expect(html).toContain('<code>dashboard</code>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol><li>First point</li><li>Second point</li></ol>')
  })

  it('normalizes CRLF and CR line endings', () => {
    expect(renderMarkdown('a\r\nb')).toBe('<p>a<br>b</p>')
    expect(renderMarkdown('# h\rtext')).toBe('<h1>h</h1><p>text</p>')
  })

  it('treats existing plain-text notes as valid Markdown (superset, no migration)', () => {
    // A note authored before this feature is just a paragraph.
    const plain = 'Open the settings panel and click Save.'
    expect(renderMarkdown(plain)).toBe('<p>Open the settings panel and click Save.</p>')
  })
})

describe('markdown: safety — no HTML/script injection', () => {
  it('does not emit an executable <script> tag from source', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</script>')
    // It survives only as inert, escaped text.
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;/script&gt;')
  })

  it('neutralizes an <img onerror> XSS payload', () => {
    const html = renderMarkdown('![x](y) <img src=x onerror=alert(1)>')
    expect(html).not.toMatch(/<img/i)
    // No live tag can carry the handler; it only exists as escaped text.
    expect(html).not.toMatch(/<[^>]*onerror/i)
    expect(html).toContain('&lt;img')
  })

  it('escapes raw HTML even inside list items and headings', () => {
    expect(renderMarkdown('- <script>alert(1)</script>')).toContain('&lt;script&gt;')
    expect(renderMarkdown('# <b>x</b>')).toBe('<h1>&lt;b&gt;x&lt;/b&gt;</h1>')
  })

  it('does not let an HTML injection escape a code span', () => {
    const html = renderMarkdown('`</code><script>alert(1)</script>`')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    // The literal backticked content is escaped inside a single code element.
    expect(html.startsWith('<p><code>')).toBe(true)
  })

  it('never produces an unescaped angle bracket that opens an unknown tag', () => {
    const payloads = [
      '<iframe src=javascript:alert(1)>',
      '<a href="javascript:alert(1)">x</a>',
      '<svg/onload=alert(1)>',
      '<style>body{display:none}</style>'
    ]
    for (const p of payloads) {
      const html = renderMarkdown(p)
      expect(html).not.toMatch(/<(iframe|a|svg|style)[\s>/]/i)
      expect(html).toContain('&lt;')
    }
  })
})
