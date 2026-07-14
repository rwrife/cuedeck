import { useEffect, useMemo, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { collectReferencedVariables, validateVariableName } from '@shared/variables'
import { variableValueFieldId } from '@shared/buildLanguage'
import { REVEAL_VARIABLE_EVENT } from '../store/deckStore'

/**
 * One editable variable row: key input, value input, delete. The key is only
 * committed on blur / Enter so that intermediate keystrokes don't churn the map
 * (and so an in-progress rename to an existing/blank key can be rejected without
 * losing what the user typed). Value edits are live.
 */
function VariableRow({
  name,
  value
}: {
  name: string
  value: string
}): JSX.Element {
  const setVariable = useDeckStore((s) => s.setVariable)
  const removeVariable = useDeckStore((s) => s.removeVariable)
  const renameVariable = useDeckStore((s) => s.renameVariable)
  const variables = useDeckStore((s) => s.deck?.variables ?? {})

  const [draftKey, setDraftKey] = useState(name)
  // Inline validation guidance shown instead of a silent revert (#38).
  const [keyError, setKeyError] = useState<string | null>(null)

  function commitKey(): void {
    const next = draftKey.trim()
    if (next === name) {
      setDraftKey(name)
      setKeyError(null)
      return
    }
    const others = Object.keys(variables).filter((k) => k !== name)
    const check = validateVariableName(next, others, name)
    if (!check.ok) {
      // Keep what the user typed and tell them why it can't be applied, rather
      // than silently snapping back to the old key (#38).
      setKeyError(check.reason ?? 'Invalid name.')
      return
    }
    setKeyError(null)
    renameVariable(name, next)
  }

  const empty = value.trim().length === 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
      <input
        value={draftKey}
        onChange={(e) => {
          setDraftKey(e.target.value)
          if (keyError) setKeyError(null)
        }}
        onBlur={commitKey}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraftKey(name)
            setKeyError(null)
            e.currentTarget.blur()
          }
        }}
        spellCheck={false}
        aria-label={`Variable name (${name})`}
        aria-invalid={keyError ? true : undefined}
        className={`w-40 shrink-0 rounded border bg-deck-panel px-2 py-1 font-mono text-xs outline-none focus:border-deck-accent ${
          keyError ? 'border-deck-status-error' : 'border-deck-border'
        }`}
      />
      <span className="text-deck-muted">=</span>
      <input
        id={variableValueFieldId(name)}
        value={value}
        onChange={(e) => setVariable(name, e.target.value)}
        placeholder="value…"
        spellCheck={false}
        aria-label={`Value for ${name}`}
        className={`flex-1 rounded border bg-deck-panel px-2 py-1 font-mono text-xs outline-none focus:border-deck-accent ${
          empty ? 'border-amber-500/60' : 'border-deck-border'
        }`}
      />
      {empty && (
        <span
          className="shrink-0 text-xs text-amber-500"
          title="This variable has no value; snippets that use it will show a placeholder marker when copied."
        >
          unset
        </span>
      )}
      <button
        type="button"
        onClick={() => removeVariable(name)}
        className="shrink-0 rounded px-1.5 py-1 text-sm text-deck-muted transition hover:text-red-400"
        title={`Delete variable ${name}`}
        aria-label={`Delete variable ${name}`}
      >
        ✕
      </button>
      </div>
      {keyError && (
        <p role="alert" className="pl-1 text-[11px] text-deck-status-error">
          {keyError}
        </p>
      )}
    </div>
  )
}

/**
 * Deck-level "Variables" panel (#7).
 *
 * Lets the user define/edit the `{{placeholder}}` values that snippet content
 * substitutes at copy/drag time. Collapsible to stay out of the way; shows a
 * count badge and a one-click "Add referenced" action that scoops up every
 * `{{variable}}` used anywhere in the deck that isn't defined yet.
 */
export function VariablesPanel(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)!
  // Read the raw slice; coalesce inside a memo so the useMemo below has a stable
  // dependency (avoids re-running on every render for the empty-map default).
  const rawVariables = useDeckStore((s) => s.deck?.variables)
  const variables = useMemo(() => rawVariables ?? {}, [rawVariables])
  const setVariable = useDeckStore((s) => s.setVariable)
  const addReferencedVariables = useDeckStore((s) => s.addReferencedVariables)
  const setStatusMessage = useDeckStore((s) => s.setStatusMessage)


  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  // Inline guidance for the new-variable field (#38).
  const [newError, setNewError] = useState<string | null>(null)

  // React to a readiness warning that links here (#36): open the panel and
  // focus the offending variable's value field so the user lands on the fix.
  useEffect(() => {
    function onReveal(e: Event): void {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name
      setOpen(true)
      if (!name) return
      // Wait a frame so the collapsed panel has mounted the fields.
      window.requestAnimationFrame(() => {
        const el = document.getElementById(variableValueFieldId(name))
        if (el instanceof HTMLInputElement) {
          el.scrollIntoView({ block: 'center' })
          el.focus()
          el.select()
        }
      })
    }
    window.addEventListener(REVEAL_VARIABLE_EVENT, onReveal)
    return () => window.removeEventListener(REVEAL_VARIABLE_EVENT, onReveal)
  }, [])

  const entries = Object.entries(variables)
  const count = entries.length

  // Variables referenced in snippet content but not yet defined — the source of
  // the "N undefined" nudge and the "Add referenced" button.
  const undefinedRefs = useMemo(() => {
    const referenced = collectReferencedVariables(
      deck.cards.flatMap((c) => c.snippets.map((s) => s.content))
    )
    return referenced.filter((name) => !(name in variables))
  }, [deck.cards, variables])

  function addNew(): void {
    const key = newName.trim()
    if (!key) return
    const check = validateVariableName(key, Object.keys(variables))
    if (!check.ok) {
      setNewError(check.reason ?? 'Invalid name.')
      return
    }
    setNewError(null)
    setVariable(key, '')
    setNewName('')
  }

  function addReferenced(): void {
    const added = addReferencedVariables()
    if (added.length > 0) {
      setOpen(true)
      setStatusMessage(`Added ${added.length} variable${added.length === 1 ? '' : 's'}.`)
    }
  }

  return (
    <div className="rounded-lg border border-deck-border bg-deck-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-deck-muted transition hover:text-deck-text"
          aria-expanded={open}
        >
          <span className="inline-block w-3 text-center">{open ? '▾' : '▸'}</span>
          Variables
          <span className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-deck-muted">
            {count}
          </span>
        </button>
        {undefinedRefs.length > 0 && (
          <button
            type="button"
            onClick={addReferenced}
            className="rounded bg-deck-card px-2 py-0.5 text-xs text-amber-500 transition hover:bg-deck-accent hover:text-white"
            title={`Define the ${undefinedRefs.length} variable(s) referenced by snippets but not yet set: ${undefinedRefs.join(', ')}`}
          >
            + Add {undefinedRefs.length} referenced
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t border-deck-border px-3 py-3">
          {count === 0 ? (
            <p className="text-xs text-deck-muted">
              No variables yet. Define values here, then reference them in snippet
              content as{' '}
              <code className="rounded bg-deck-card px-1 font-mono">{'{{name}}'}</code>.
            </p>
          ) : (
            entries.map(([name, value]) => (
              <VariableRow key={name} name={name} value={value} />
            ))
          )}

          {/* New-variable row */}
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                if (newError) setNewError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addNew()
                }
              }}
              placeholder="new variable name…"
              spellCheck={false}
              aria-label="New variable name"
              aria-invalid={newError ? true : undefined}
              className={`w-40 shrink-0 rounded border border-dashed bg-deck-panel px-2 py-1 font-mono text-xs outline-none focus:border-deck-accent ${
                newError ? 'border-deck-status-error' : 'border-deck-border'
              }`}
            />
            <button
              type="button"
              onClick={addNew}
              disabled={newName.trim().length === 0}
              className="rounded bg-deck-card px-2 py-1 text-xs transition enabled:hover:bg-deck-accent enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add
            </button>
            </div>
            {newError && (
              <p role="alert" className="pl-1 text-[11px] text-deck-status-error">
                {newError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
