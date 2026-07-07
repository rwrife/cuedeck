import { renderMarkdown } from '@shared/markdown'

/**
 * Render a card's talking-point notes as sanitized Markdown (#6).
 *
 * The notes are stored as raw Markdown text; {@link renderMarkdown} turns a safe
 * subset (headings, bold/italic, inline code, bullet/ordered lists, task
 * checkboxes) into an HTML string whose every text node is HTML-escaped and whose
 * only tags are ones the renderer emits itself. Because the string can never
 * contain author-supplied markup, injecting it via `dangerouslySetInnerHTML` is
 * safe and needs no runtime sanitizer — and it introduces no inline scripts, so
 * the renderer's CSP (`src/renderer/index.html`) stays intact.
 *
 * Layout/typography come from the scoped `.cuedeck-md` rules in
 * `src/renderer/src/styles/index.css`. Consumers pass extra classes (e.g. a
 * larger presenter font) via `className`.
 */
export function MarkdownNotes({
  source,
  className = ''
}: {
  source: string
  className?: string
}): JSX.Element {
  const html = renderMarkdown(source)
  return (
    <div
      className={`cuedeck-md ${className}`.trim()}
      // Safe: `html` is built only from escaped text + a fixed tag allow-set.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
