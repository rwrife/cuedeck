import { useEffect, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { Snippet } from '@shared/types'
import {
  positionLabel,
  presenterProgress,
  presenterStepDensity,
  snippetHotkeyLabel
} from '@shared/presenter'
import { renderSnippet } from '@shared/variables'
import { MarkdownNotes } from './MarkdownNotes'
import { Button } from './ui/Button'
import { KeyboardHint } from './ui/KeyboardHint'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  CloseIcon,
  PinIcon
} from './ui/icons'

/**
 * A single large, read-only copy button used in Presenter Mode.
 *
 * Deliberately minimal: a number/hotkey badge, the snippet label, and a big
 * Copy action with an unmistakable "Copied" confirmation (a check icon *and*
 * the word "Copied", announced to assistive tech — never color alone). The
 * badge doubles as a native drag-out handle (drop onto any text field to
 * paste), mirroring the editor's snippet drag affordance. No editing,
 * expanding, or deleting here — this is the delivery surface, not the
 * authoring surface.
 */
function PresenterSnippet({
  cardId,
  snippet,
  index
}: {
  cardId: string
  snippet: Snippet
  index: number
}): JSX.Element {
  const copySnippet = useDeckStore((s) => s.copySnippet)
  const copied = useDeckStore((s) => s.lastCopiedSnippetId === snippet.id)
  // Deck variables for drag-out substitution (copy path substitutes in-store).
  const variables = useDeckStore((s) => s.deck?.variables)

  // Only the first nine paste actions get a keyboard-visible number badge
  // (matching the 1–9 copy hotkeys); the rest fall back to the drag glyph.
  const hotkey = snippetHotkeyLabel(index)
  const label = snippet.label || 'Untitled snippet'

  function onDragStartOut(e: React.DragEvent): void {
    e.dataTransfer.setData('text/plain', renderSnippet(snippet.content, variables))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      onClick={() => void copySnippet(cardId, snippet.id)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deck-accent focus-visible:ring-offset-2 focus-visible:ring-offset-deck-bg ${
        copied
          ? 'border-deck-success bg-deck-success text-white'
          : 'border-deck-border bg-deck-card text-deck-text hover:border-deck-accent hover:bg-deck-panel'
      }`}
      title={
        hotkey
          ? `Copy “${label}” to the clipboard (press ${hotkey})`
          : `Copy “${label}” to the clipboard`
      }
    >
      <span
        draggable
        onDragStart={onDragStartOut}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-9 w-9 shrink-0 cursor-grab select-none items-center justify-center rounded-lg text-base font-bold active:cursor-grabbing ${
          copied ? 'bg-white/25 text-white' : 'bg-deck-accent text-white'
        }`}
        title="Drag me into your demo app"
        aria-hidden={hotkey === null}
      >
        {copied ? <CheckIcon /> : (hotkey ?? <ArrowUpRightIcon />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{label}</span>
        {snippet.content && (
          <span className="mt-0.5 block truncate font-mono text-xs opacity-70">
            {snippet.content.split('\n')[0]}
          </span>
        )}
      </span>
      <span
        className="flex shrink-0 items-center gap-1 text-sm font-semibold uppercase tracking-wide opacity-90"
        aria-live="polite"
      >
        {copied ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          'Copy'
        )}
      </span>
    </button>
  )
}

/**
 * Presenter Mode (#5, refined in #37): a compact, distraction-free, read-only
 * surface for running a live demo — the answer to "what do I need right now?".
 *
 * Retains only the active step's title + talking-point notes (read-only, large
 * and high-contrast for reading from a distance), large numbered paste actions,
 * a progress bar + position indicator, and previous/next navigation. There are
 * no editing controls here — no textareas, no delete buttons — so the user can
 * drive a demo without the authoring chrome getting in the way. Keyboard
 * shortcuts are surfaced contextually on the controls themselves (number badges
 * on paste actions, arrow-key chips on prev/next, F5 on Exit) so nobody has to
 * memorize them.
 *
 * Layout adapts to the step's content density (via {@link presenterStepDensity})
 * so a sparse step reads as deliberate rather than broken, while a content-heavy
 * step stays scrollable within the compact window.
 *
 * The window-level side effects (compact size + always-on-top, restored on
 * exit) are handled by the store's `enterPresent`/`exitPresent` →
 * `window.cuedeck.window.setPresenter` IPC; exiting returns to Rehearse. This
 * component only renders the layout and the read-only interactions.
 */
export function PresenterView(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const exitPresent = useDeckStore((s) => s.exitPresent)

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length

  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  const progress = presenterProgress(index, total)
  const hasNotes = !!card && card.notes.trim().length > 0
  const density = card
    ? presenterStepDensity({
        notesLength: card.notes.trim().length,
        snippetCount: card.snippets.length
      })
    : 'sparse'

  // Track always-on-top so we can surface the state; the window is pinned on
  // entering presenter mode, but the user may have already had it pinned.
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    window.cuedeck.window.getAlwaysOnTop().then(setPinned)
  }, [])

  // Sparse steps center their content with extra breathing room so they look
  // deliberate; denser steps top-align and scroll within the compact window.
  const bodyLayout =
    density === 'sparse' ? 'justify-center gap-6' : density === 'balanced' ? 'gap-5' : 'gap-4'

  return (
    <div className="flex h-full flex-col bg-deck-bg text-deck-text">
      {/* Compact top bar: exit → Rehearse + position + on-top indicator */}
      <header className="flex items-center justify-between gap-2 border-b border-deck-border bg-deck-panel px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          onClick={() => exitPresent()}
          title="Exit to Rehearse (F5 or Ctrl/Cmd+P)"
        >
          Exit
          <KeyboardHint keys={['F5']} />
        </Button>
        <span className="flex items-center gap-2 text-xs text-deck-muted">
          {pinned && (
            <span title="Window is pinned on top" aria-label="Pinned on top">
              <PinIcon />
            </span>
          )}
          <span className="font-mono text-sm tabular-nums text-deck-text">
            {positionLabel(index, total)}
          </span>
        </span>
      </header>

      {/* Progress bar: fills as the presenter advances through the deck. */}
      <div
        className="h-1 w-full shrink-0 bg-deck-card"
        role="progressbar"
        aria-label="Presentation progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index >= 0 ? index + 1 : 0}
      >
        <div
          className="h-full bg-deck-accent transition-all motion-reduce:transition-none"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Card body */}
      {card ? (
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-auto p-4 ${bodyLayout}`}
          // Scale the presenter's talking-point typography by the font-size
          // preference (#8). Applied here (not on paste-action buttons) so the
          // demo controls stay a consistent, tappable size.
          style={{ fontSize: 'calc(1rem * var(--deck-font-scale, 1))' }}
        >
          <div
            className={
              density === 'sparse'
                ? 'flex flex-col gap-4 text-center'
                : 'flex flex-col gap-4'
            }
          >
            <h1 className="text-2xl font-bold leading-tight">{card.title || 'Untitled step'}</h1>

            {hasNotes ? (
              <MarkdownNotes
                source={card.notes}
                className={`text-lg leading-relaxed text-deck-text ${
                  density === 'sparse' ? 'text-left' : ''
                }`}
              />
            ) : (
              <p className="text-base italic text-deck-muted">No talking points for this step.</p>
            )}
          </div>

          {card.snippets.length > 0 && (
            <div className="flex flex-col gap-2 text-left">
              {card.snippets.map((snippet, i) => (
                <PresenterSnippet key={snippet.id} cardId={card.id} snippet={snippet} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-deck-muted">
          {total === 0 ? 'This deck has no steps yet.' : 'No step selected.'}
        </div>
      )}

      {/* Prev / next controls — same real navigation as mouse, keyboard, and
          live control. Arrow-key chips surface the shortcuts contextually. */}
      <footer className="flex items-center gap-2 border-t border-deck-border bg-deck-panel px-3 py-2.5">
        <Button
          variant="secondary"
          onClick={() => stepActiveCard(-1)}
          disabled={atStart}
          title="Previous step (←)"
          className="flex-1 justify-center"
        >
          <ArrowLeftIcon />
          Prev
          <KeyboardHint keys={['←']} />
        </Button>
        <Button
          variant="secondary"
          onClick={() => stepActiveCard(1)}
          disabled={atEnd}
          title="Next step (→)"
          className="flex-1 justify-center"
        >
          <KeyboardHint keys={['→']} />
          Next
          <ArrowRightIcon />
        </Button>
      </footer>
    </div>
  )
}
