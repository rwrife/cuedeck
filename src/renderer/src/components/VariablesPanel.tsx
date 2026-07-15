import { useEffect, useMemo, useRef, useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { collectReferencedVariables, validateVariableName } from '@shared/variables'
import { IconButton } from './ui/IconButton'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon } from './ui/icons'

/**
 * One editable variable row: key input, value input, delete. The key is only
 * committed on blur / Enter. An invalid rename (blank, illegal characters, or a
 * collision) no longer silently reverts — it surfaces inline guidance and keeps
 * the typed draft so the user can fix it, and never loses the variable's value
 * (#38). Value edits are live.
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
  const focusVariableName = useDeckStore((s) => s.focusVariableName)
  const clearFocusVariable = useDeckStore((s) => s.clearFocusVariable)

  const [draftKey, setDraftKey] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  // Keep the draft in sync if the underlying name changes out from under us
  // (e.g. an undo restores this row's original key).
  useEffect(() => {
    setDraftKey(name)
    setError(null)
  }, [name])

  // Predictable focus target after an undo restores this variable (#38): focus
  // this row's name input, then consume the one-shot request.
  useEffect(() => {
    if (focusVariableName === name) {
      nameRef.current?.focus()
      nameRef.current?.select()
      clearFocusVariable()
    }
  }, [focusVariableName, name, clearFocusVariable])

  function commitKey(): void {
    const result = validateVariableName(draftKey, Object.keys(variables), { current: name })
    if (!result.ok) {
      // Inline guidance instead of a silent revert; keep the draft so the user
      // can correct it. The stored value is untouched, so nothing is lost.
      setError(result.error)
      return
    }
    setError(null)
    if (result.name !== name) renameVariable(name, result.name)
  }

  const empty = value.trim().length === 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          ref={nameRef}
          value={draftKey}
          onChange={(e) => {
            setDraftKey(e.target.value)
            if (error) setError(null)
          }}
          onBlur={commitKey}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraftKey(name)
              setError(null)
              e.currentTarget.blur()
            }
          }}
          spellCheck={false}
          aria-label={`Variable name (${name})`}
          aria-invalid={error ? true : undefined}
          className={`w-40 shrink-0 rounded border bg-deck-panel px-2 py-1 font-mono text-xs outline-none focus:border-deck-accent ${
            error ? 'border-deck-danger' : 'border-deck-border'
          }`}
        />
        <span className="text-deck-muted">=</span>
        <input
          value={value}
          onChange={(e) => setVariable(name, e.target.value)}
          placeholder="value…"
          spellCheck={false}
          aria-label={`Value for ${name}`}
          className={`flex-1 rounded border bg-deck-panel px-2 py-1 font-mono text-xs outline-none focus:border-deck-accent ${
            empty ? 'border-deck-warning/60' : 'border-deck-border'
          }`}
        />
        {empty && (
          <span
            className="shrink-0 text-xs text-deck-warning"
            title="This variable has no value; snippets that use it will show a placeholder marker when copied."
          >
            unset
          </span>
        )}
        <IconButton
          label={`Delete variable ${name}`}
          icon={<CloseIcon />}
          size="sm"
          onClick={() => removeVariable(name)}
          className="shrink-0 hover:!text-deck-danger"
        />
      </div>
      {error && (
        <p role="alert" className="pl-1 text-xs text-deck-danger">
          {error}
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
 *
 * Also auto-expands on the store's one-shot `focusVariablesPanel` request
 * (#36): clicking a Rehearse "missing variable" readiness warning navigates
 * here and arms that flag so the fix location is visible immediately.
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
  // One-shot request (#36): auto-expand when a Rehearse readiness warning
  // about a missing variable value navigates back here, so the fix location
  // is visible without a fragile DOM query/scroll.
  const focusVariablesPanel = useDeckStore((s) => s.focusVariablesPanel)
  const clearFocusVariablesPanel = useDeckStore((s) => s.clearFocusVariablesPanel)
  const focusVariableName = useDeckStore((s) => s.focusVariableName)

  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  useEffect(() => {
    if (focusVariablesPanel) {
      setOpen(true)
      clearFocusVariablesPanel()
    }
  }, [focusVariablesPanel, clearFocusVariablesPanel])

  const entries = Object.entries(variables)
  const count = entries.length

  // When an undo restores a variable (#38), open the panel so the row — and its
  // focus target — is actually visible. The row itself moves DOM focus.
  useEffect(() => {
    if (focusVariableName) setOpen(true)
  }, [focusVariableName])

  // Variables referenced in snippet content but not yet defined — the source of
  // the "N undefined" nudge and the "Add referenced" button.
  const undefinedRefs = useMemo(() => {
    const referenced = collectReferencedVariables(
      deck.cards.flatMap((c) => c.snippets.map((s) => s.content))
    )
    return referenced.filter((name) => !(name in variables))
  }, [deck.cards, variables])

  function addNew(): void {
    const result = validateVariableName(newName, Object.keys(variables))
    if (!result.ok) {
      // Inline guidance rather than a silent revert or a detached status toast.
      setNewError(result.error)
      return
    }
    setVariable(result.name, '')
    setNewName('')
    setNewError(null)
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
          <span className="inline-block w-3 text-center">
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
          Variables
          <span className="rounded bg-deck-card px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-deck-muted">
            {count}
          </span>
        </button>
        {undefinedRefs.length > 0 && (
          <button
            type="button"
            onClick={addReferenced}
            className="rounded bg-deck-card px-2 py-0.5 text-xs text-deck-warning transition hover:bg-deck-accent hover:text-white"
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
                  newError ? 'border-deck-danger' : 'border-deck-border'
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
              <p role="alert" className="pl-1 text-xs text-deck-danger">
                {newError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
