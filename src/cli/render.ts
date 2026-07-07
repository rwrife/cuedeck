/**
 * Plain-text deck preview for `cuedeck render` (#14).
 *
 * Produces a reviewer-friendly rendering of a deck's running order — card
 * titles, talking-point notes, and snippets — as a single plain-text string
 * suitable for reading in a terminal or pasting into a review. It's a pure
 * data→string function (no DOM, no Electron) so it lives here and is unit
 * tested alongside the rest of the CLI.
 *
 * Snippet content is rendered through the shared {@link renderSnippet} engine so
 * that `{{variable}}` placeholders resolve against the deck's `variables` map
 * exactly as they would when copied/dragged in the app; unset variables show the
 * same visible `⟦name⟧` marker the app uses, so a reviewer can see what still
 * needs filling in.
 */

import { renderSnippet, type Deck } from '../shared'

/** Indent every line of `text` by `pad` spaces (blank lines stay blank). */
function indent(text: string, pad: number): string {
  const prefix = ' '.repeat(pad)
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join('\n')
}

/**
 * Render a deck to a plain-text running order.
 *
 * Layout (stable, so it's easy to diff/review):
 *
 * ```
 * <Deck name>
 * <N> card(s)
 *
 * 1. <Card title>
 *    <notes, indented, verbatim>
 *    Snippets:
 *      - <label>: <content with {{vars}} resolved>
 * ```
 *
 * Cards with no title render as `(untitled)`; cards with no notes/snippets omit
 * those sections. An empty deck renders just its header and a `(no cards)` line.
 */
export function renderDeckText(deck: Deck): string {
  const vars = deck.variables ?? {}
  const lines: string[] = []

  lines.push(deck.name || '(untitled deck)')
  lines.push(`${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}`)

  if (deck.cards.length === 0) {
    lines.push('')
    lines.push('(no cards)')
    return lines.join('\n')
  }

  deck.cards.forEach((card, i) => {
    lines.push('')
    lines.push(`${i + 1}. ${card.title || '(untitled)'}`)

    const notes = card.notes?.trim()
    if (notes) {
      lines.push(indent(notes, 3))
    }

    if (card.snippets.length > 0) {
      lines.push('   Snippets:')
      for (const snippet of card.snippets) {
        const label = snippet.label || '(unlabeled)'
        const content = renderSnippet(snippet.content, vars)
        // Keep single-line snippets inline; indent continuation lines so
        // multi-line snippet bodies stay visually grouped under their label.
        const [first, ...rest] = content.split('\n')
        lines.push(`     - ${label}: ${first}`)
        for (const line of rest) {
          lines.push(line.length > 0 ? `       ${line}` : line)
        }
      }
    }
  })

  return lines.join('\n')
}
