/**
 * A tiny, dependency-free, safe Markdown → HTML renderer for CueDeck talking-point
 * notes (#6).
 *
 * ## Why hand-rolled instead of `marked`/`markdown-it` + `DOMPurify`?
 *
 * The issue suggests a small renderer (e.g. `marked` + `DOMPurify`). We
 * deliberately went one step smaller and wrote a self-contained renderer for a
 * strict, well-known subset. The reasons:
 *
 *  - **Security by construction.** This renderer is *escape-first*: every scrap
 *    of user input is HTML-escaped BEFORE any Markdown is turned into tags, and
 *    the only tags that ever appear in the output are ones this module emits
 *    itself. Raw HTML in the source (`<script>`, `<img onerror=…>`, `<b>`, …) is
 *    therefore always rendered as inert text — there is no code path that copies
 *    a source substring into a tag position. That is a stronger guarantee than
 *    "parse arbitrary HTML, then sanitize it," and it needs no allow/deny list to
 *    keep in sync with a parser's quirks.
 *  - **CSP-friendly, zero-DOM.** `DOMPurify` needs a DOM (a real one in the
 *    renderer, or `jsdom` in tests). CueDeck's test suite runs in a pure Node
 *    environment (see `vitest.config.ts`), and the rest of the app keeps its
 *    decision logic here in `src/shared` precisely so it can be unit-tested
 *    without Electron or a DOM. A string-in/string-out renderer fits that model
 *    and is trivially testable.
 *  - **No new supply-chain surface.** `notes` only needs a handful of inline and
 *    block constructs; pulling in a full CommonMark engine (and a sanitizer to
 *    fence it back in) is a lot of dependency for that. Fewer deps → less to
 *    audit and fewer transitive CVEs.
 *
 * The output is a plain HTML string. The renderer is responsible for injecting it
 * via React's `dangerouslySetInnerHTML`; because the string is built exclusively
 * from escaped text plus a fixed set of tags this module controls, that is safe
 * and does not require inline scripts (so the existing CSP in
 * `src/renderer/index.html` stays intact).
 *
 * ## Supported subset
 *
 * Block level:
 *  - ATX headings, `#`..`######` → `<h1>`..`<h6>`.
 *  - Unordered lists (`-`, `*`, `+`) → `<ul><li>`.
 *  - Ordered lists (`1.`, `2.`, …) → `<ol><li>`.
 *  - GitHub-style task list items (`- [ ]` / `- [x]`) → `<li>` with a disabled
 *    checkbox. Task items live inside the surrounding `<ul>`.
 *  - Everything else → `<p>` paragraphs, with single newlines inside a paragraph
 *    becoming `<br>` (a pragmatic, teleprompter-friendly choice).
 *
 * Inline (applied inside headings, list items, and paragraphs):
 *  - `**bold**` / `__bold__` → `<strong>`.
 *  - `*italic*` / `_italic_` → `<em>`.
 *  - `` `code` `` → `<code>` (inline code is escaped and never re-parsed).
 *
 * Anything outside this subset (links, images, blockquotes, tables, raw HTML) is
 * intentionally not interpreted and simply renders as escaped text. That keeps the
 * feature "lightweight" per the issue and preserves the safety guarantee above.
 */

/** Escape the five characters that are significant in HTML text/attribute context. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A single inline-code placeholder token, used to shield code spans from further parsing. */
interface CodeToken {
  placeholder: string
  html: string
}

/**
 * Render the inline span constructs (`code`, bold, italic) for one already
 * block-classified line of text.
 *
 * Ordering matters: inline code is extracted FIRST (and replaced with an opaque
 * placeholder) so that `*`/`_` inside a code span are never treated as emphasis,
 * and so the code content itself is escaped verbatim. The remaining text is then
 * HTML-escaped and run through the emphasis passes, and finally the code
 * placeholders are swapped back in.
 */
export function renderInline(text: string): string {
  const codeTokens: CodeToken[] = []

  // 1. Pull out `code spans` before anything else. Use a placeholder that cannot
  //    collide with user text (contains characters we will have escaped away).
  let working = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    const placeholder = `\u0000CODE${codeTokens.length}\u0000`
    codeTokens.push({ placeholder, html: `<code>${escapeHtml(code)}</code>` })
    return placeholder
  })

  // 2. Escape everything else so no raw HTML can survive.
  working = escapeHtml(working)

  // 3. Emphasis. Do the two-character markers before the one-character ones so
  //    `**x**` becomes <strong> rather than nested <em>. Non-greedy, and the
  //    content must be non-empty and not start/end with whitespace.
  working = working
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    // Italic: single * or _. Avoid matching across an existing <strong> boundary
    // is unnecessary because those markers are already consumed above.
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/_(?=\S)([\s\S]*?\S)_/g, '<em>$1</em>')

  // 4. Restore code spans.
  for (const { placeholder, html } of codeTokens) {
    working = working.split(placeholder).join(html)
  }

  return working
}

/** Classification of a single source line, used by the block assembler. */
type Line =
  | { kind: 'blank' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; text: string; checked: boolean | null }
  | { kind: 'ol'; text: string }
  | { kind: 'p'; text: string }

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const UL_RE = /^\s*[-*+]\s+(.*)$/
const OL_RE = /^\s*\d+\.\s+(.*)$/
const TASK_RE = /^\[([ xX])\]\s+(.*)$/

/** Classify one raw line of Markdown into a {@link Line}. */
function classify(raw: string): Line {
  if (raw.trim() === '') return { kind: 'blank' }

  const heading = HEADING_RE.exec(raw)
  if (heading) {
    return { kind: 'heading', level: heading[1].length, text: heading[2].trim() }
  }

  const ul = UL_RE.exec(raw)
  if (ul) {
    const task = TASK_RE.exec(ul[1])
    if (task) {
      return { kind: 'ul', text: task[2], checked: task[1].toLowerCase() === 'x' }
    }
    return { kind: 'ul', text: ul[1], checked: null }
  }

  const ol = OL_RE.exec(raw)
  if (ol) {
    return { kind: 'ol', text: ol[1] }
  }

  return { kind: 'p', text: raw }
}

/** Render one `<li>` (plain or task list item). */
function renderListItem(text: string, checked: boolean | null): string {
  const body = renderInline(text)
  if (checked === null) return `<li>${body}</li>`
  const box = `<input type="checkbox" disabled${checked ? ' checked' : ''} />`
  const cls = checked ? ' class="task-item task-checked"' : ' class="task-item"'
  return `<li${cls}>${box} ${body}</li>`
}

/**
 * Render a safe subset of Markdown to an HTML string.
 *
 * The output contains only tags this module emits (`h1`..`h6`, `p`, `br`, `ul`,
 * `ol`, `li`, `strong`, `em`, `code`, and a disabled checkbox `input`); all text
 * is HTML-escaped. It is therefore safe to inject via `dangerouslySetInnerHTML`.
 *
 * Empty / whitespace-only input renders as an empty string so callers can show
 * their own "no talking points" placeholder.
 */
export function renderMarkdown(source: string): string {
  if (!source || source.trim() === '') return ''

  // Normalize newlines so \r\n and \r behave like \n.
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(classify)

  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === 'blank') {
      i += 1
      continue
    }

    if (line.kind === 'heading') {
      out.push(`<h${line.level}>${renderInline(line.text)}</h${line.level}>`)
      i += 1
      continue
    }

    if (line.kind === 'ul') {
      const items: string[] = []
      while (i < lines.length && lines[i].kind === 'ul') {
        const item = lines[i] as Extract<Line, { kind: 'ul' }>
        items.push(renderListItem(item.text, item.checked))
        i += 1
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (line.kind === 'ol') {
      const items: string[] = []
      while (i < lines.length && lines[i].kind === 'ol') {
        const item = lines[i] as Extract<Line, { kind: 'ol' }>
        items.push(renderListItem(item.text, null))
        i += 1
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // Paragraph: gather consecutive non-blank, non-block lines and join with <br>.
    const para: string[] = []
    while (i < lines.length && lines[i].kind === 'p') {
      para.push(renderInline((lines[i] as Extract<Line, { kind: 'p' }>).text.trim()))
      i += 1
    }
    out.push(`<p>${para.join('<br>')}</p>`)
  }

  return out.join('')
}
