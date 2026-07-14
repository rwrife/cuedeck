import { useMemo, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import type { CueCard, Snippet } from '@shared/types'
import { evaluateReadiness, groupIssuesByCard, type ReadinessIssue } from '@shared/readiness'
import { positionLabel } from '@shared/presenter'
import { classifyVariables, renderSnippet } from '@shared/variables'
import { MarkdownNotes } from './MarkdownNotes'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { EmptyState } from './ui/EmptyState'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RehearseIcon,
  WarningIcon
} from './ui/icons'

/**
 * The preflight summary (#36): Ready/warning counts up front, plus the full
 * list of readiness warnings — each explaining the concern and offering a
 * "Fix in Build" action that jumps straight to the exact step (and, for a
 * missing-variable warning, opens the deck-level Variables area). Warnings
 * are informational only; there is no "blocked" state here, matching the
 * design's "inform, never block" rule.
 */
function ReadinessSummary({
  result,
  onFix
}: {
  result: ReturnType<typeof evaluateReadiness>
  onFix: (issue: ReadinessIssue) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const { issues, totalSteps, readyStepCount } = result
  const warningCount = issues.length

  if (totalSteps === 0) {
    // Deck-level "no steps" case: one issue, no ready/warning framing applies.
    const issue = issues[0]
    return (
      <div className="flex items-center justify-between gap-3 border-b border-deck-border bg-deck-warning/10 px-4 py-3 text-sm text-deck-warning">
        <span className="flex items-center gap-2">
          <WarningIcon /> {issue?.message}
        </span>
        {issue && (
          <Button variant="secondary" size="sm" onClick={() => onFix(issue)}>
            Go to Build
          </Button>
        )}
      </div>
    )
  }

  const allReady = warningCount === 0

  return (
    <div className="border-b border-deck-border bg-deck-panel">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={allReady}
        aria-expanded={allReady ? undefined : expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-2 text-sm">
          {allReady ? (
            <span className="flex items-center gap-2 font-medium text-deck-success">
              <CheckIcon /> Ready — {readyStepCount} of {totalSteps} steps look good.
            </span>
          ) : (
            <span className="flex items-center gap-2 font-medium text-deck-warning">
              <WarningIcon /> {readyStepCount} of {totalSteps} steps ready ·{' '}
              {warningCount} warning{warningCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {!allReady && (
          <span className="text-deck-muted" aria-hidden="true">
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
        )}
      </button>

      {!allReady && expanded && (
        <ul className="flex flex-col gap-2 border-t border-deck-border px-4 py-3">
          {issues.map((issue, i) => (
            <li
              key={`${issue.cardId}-${issue.code}-${issue.variableName ?? i}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-deck-warning/30 bg-deck-warning/5 px-3 py-2"
            >
              <span className="flex min-w-0 items-start gap-2 text-sm text-deck-text">
                <span className="mt-0.5 shrink-0 text-deck-warning" aria-hidden="true">
                  <WarningIcon />
                </span>
                <span className="min-w-0 break-words">{issue.message}</span>
              </span>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onFix(issue)}>
                Fix in Build
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Read-only step navigator for Rehearse (#36). Unlike Build's `CardList`,
 * this has no add/reorder/delete affordances — Rehearse never mutates the
 * deck — and surfaces each step's readiness warning count as a small badge
 * so problem steps are visible while scanning the running order.
 */
function RehearseStepList({
  cards,
  activeCardId,
  issuesByCard,
  onSelect
}: {
  cards: readonly CueCard[]
  activeCardId: string | null
  issuesByCard: Map<string, ReadinessIssue[]>
  onSelect: (cardId: string) => void
}): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-deck-muted">
          Running Order
        </span>
      </div>
      <ul className="flex-1 overflow-auto px-2 pb-2">
        {cards.map((card, i) => {
          const isActive = activeCardId === card.id
          const issueCount = issuesByCard.get(card.id)?.length ?? 0
          return (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => onSelect(card.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                  isActive ? 'bg-deck-accent text-white' : 'text-deck-text hover:bg-deck-card'
                }`}
              >
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-deck-muted'}`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {card.title || 'Untitled step'}
                </span>
                {issueCount > 0 && (
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] ${
                      isActive ? 'bg-white/20' : 'bg-deck-warning/15 text-deck-warning'
                    }`}
                    title={`${issueCount} readiness warning${issueCount === 1 ? '' : 's'} on this step`}
                  >
                    <WarningIcon /> {issueCount}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * One piece of paste-ready content in Rehearse (#36).
 *
 * Deliberately distinct from the compact Presenter's `PresenterSnippet`:
 * Rehearse has room to show the full, variable-substituted content inline
 * (not a truncated single line) so a presenter can read exactly what will
 * land on the clipboard, plus the same "uses …" variable chips Build shows,
 * so an unfilled variable is visible on the exact content that references
 * it — not just in the preflight summary. Copy and native drag-out both
 * apply the identical substitution as Present and Build; there are no
 * editing controls.
 */
function RehearseSnippet({ cardId, snippet }: { cardId: string; snippet: Snippet }): JSX.Element {
  const copySnippet = useDeckStore((s) => s.copySnippet)
  const copied = useDeckStore((s) => s.lastCopiedSnippetId === snippet.id)
  const variables = useDeckStore((s) => s.deck?.variables)

  const { used, missing } = classifyVariables(snippet.content, variables)
  const referenced = [...used, ...missing]
  const rendered = renderSnippet(snippet.content, variables)

  function onDragStartOut(e: React.DragEvent): void {
    e.dataTransfer.setData('text/plain', rendered)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={`rounded-xl border transition-colors motion-reduce:transition-none ${
        copied ? 'border-deck-success bg-deck-success/10' : 'border-deck-border bg-deck-card'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          draggable
          onDragStart={onDragStartOut}
          className="flex h-9 w-9 shrink-0 cursor-grab select-none items-center justify-center rounded-lg bg-deck-accent text-white active:cursor-grabbing"
          title="Drag me into your demo app"
          aria-hidden="true"
        >
          <ArrowUpRightIcon />
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {snippet.label || 'Untitled paste-ready content'}
        </span>
        <Button
          variant="primary"
          active={copied}
          activeTone="success"
          icon={copied ? <CheckIcon /> : undefined}
          onClick={() => void copySnippet(cardId, snippet.id)}
          title={`Copy “${snippet.label || 'snippet'}” to the clipboard`}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {rendered.trim() && (
        <pre className="whitespace-pre-wrap break-words border-t border-deck-border bg-deck-panel px-3 py-2.5 font-mono text-sm text-deck-text">
          {rendered}
        </pre>
      )}

      {referenced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t border-deck-border px-3 py-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-wide text-deck-muted">uses</span>
          {referenced.map((name) => {
            const isMissing = missing.includes(name)
            return (
              <span
                key={name}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] ${
                  isMissing ? 'bg-deck-warning/15 text-deck-warning' : 'bg-deck-panel text-deck-muted'
                }`}
                title={
                  isMissing
                    ? `{{${name}}} has no value — set it in Build's Variables panel.`
                    : `{{${name}}} → defined in Variables`
                }
              >
                {name}
                {isMissing && <WarningIcon />}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Rehearse mode (#36): a read-only, full-window run-through of the current
 * deck, plus the preflight readiness summary described in the design spec.
 *
 * Deliberately full-window and richer than the compact Presenter surface —
 * a step list stays visible alongside the active step, paste-ready content
 * shows its full substituted text rather than a truncated line, and the
 * preflight warnings sit above the run-through — so Rehearse reads as a
 * distinct "prepare" surface, not a preview of Present. There is still
 * nothing to edit here: no title/notes fields, no add/delete/reorder
 * controls. Readiness is computed fresh from the live deck on every render
 * (`evaluateReadiness`) and is never persisted.
 */
export function RehearseView(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  const activeCardId = useDeckStore((s) => s.activeCardId)
  const setActiveCard = useDeckStore((s) => s.setActiveCard)
  const stepActiveCard = useDeckStore((s) => s.stepActiveCard)
  const navigateToBuildStep = useDeckStore((s) => s.navigateToBuildStep)

  const readiness = useMemo(() => evaluateReadiness(deck), [deck])
  const issuesByCard = useMemo(() => groupIssuesByCard(readiness.issues), [readiness.issues])

  const index = deck.cards.findIndex((c) => c.id === activeCardId)
  const card = index >= 0 ? deck.cards[index] : undefined
  const total = deck.cards.length
  const atStart = index <= 0
  const atEnd = index < 0 || index >= total - 1

  function fixInBuild(issue: ReadinessIssue): void {
    navigateToBuildStep(issue.cardId, issue.focusTarget)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReadinessSummary result={readiness} onFix={fixInBuild} />

      <div className="flex min-h-0 flex-1">
        {total > 0 && (
          <aside className="w-64 shrink-0 border-r border-deck-border bg-deck-panel">
            <RehearseStepList
              cards={deck.cards}
              activeCardId={activeCardId}
              issuesByCard={issuesByCard}
              onSelect={setActiveCard}
            />
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {card ? (
            <>
              <div className="min-h-0 flex-1 overflow-auto p-6">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-deck-muted">
                  Step {index + 1} of {total}
                </span>
                <h1 className="mb-4 text-2xl font-bold leading-tight text-deck-text">
                  {card.title || 'Untitled step'}
                </h1>

                {card.notes.trim() ? (
                  <MarkdownNotes
                    source={card.notes}
                    className="mb-6 text-base leading-relaxed text-deck-text"
                  />
                ) : (
                  <p className="mb-6 text-sm italic text-deck-muted">
                    No talking points for this step.
                  </p>
                )}

                {card.snippets.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {card.snippets.map((snippet) => (
                      <RehearseSnippet key={snippet.id} cardId={card.id} snippet={snippet} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-deck-muted">
                    No paste-ready content for this step.
                  </p>
                )}
              </div>

              {/* Prev / next — same real navigation as Present, styled for the
                  full-window Rehearse surface. */}
              <footer className="flex items-center gap-3 border-t border-deck-border bg-deck-panel px-4 py-3">
                <IconButton
                  label="Previous step"
                  icon={<ArrowLeftIcon />}
                  onClick={() => stepActiveCard(-1)}
                  disabled={atStart}
                  title="Previous step (←)"
                />
                <span className="font-mono text-sm tabular-nums text-deck-muted">
                  {positionLabel(index, total)}
                </span>
                <IconButton
                  label="Next step"
                  icon={<ArrowRightIcon />}
                  onClick={() => stepActiveCard(1)}
                  disabled={atEnd}
                  title="Next step (→)"
                />
              </footer>
            </>
          ) : (
            <EmptyState
              className="mx-auto mt-10 max-w-md border-none"
              icon={<RehearseIcon width="2em" height="2em" />}
              title="No steps yet"
              description="Add a step in Build to start rehearsing your run-through."
              action={
                <Button variant="primary" onClick={() => navigateToBuildStep(null, null)}>
                  Go to Build
                </Button>
              }
            />
          )}
        </main>
      </div>
    </div>
  )
}
