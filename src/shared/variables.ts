/**
 * Snippet variable substitution (#7) — the shared, dependency-free engine that
 * turns `{{variableName}}` placeholders in snippet content into concrete values
 * from a deck's variable map.
 *
 * Like the rest of `src/shared`, this module is pure string/data logic with no
 * DOM, Electron, or React dependency, so it can be unit-tested in the plain Node
 * test environment and reused identically by the app (main + renderer), the CLI,
 * and the MCP server. Substitution therefore behaves the same everywhere text is
 * copied, dragged out, or previewed.
 *
 * ## Placeholder syntax
 *
 * A placeholder is `{{name}}`, where `name` matches {@link VARIABLE_NAME_PATTERN}
 * (letters, digits, `_`, `-`, `.`), optionally surrounded by inner whitespace:
 * `{{ email }}` and `{{email}}` reference the same variable `email`. Anything that
 * doesn't match — `{{ }}`, `{{a b}}`, a lone `{{` — is left untouched as literal
 * text, so ordinary content containing braces is safe.
 *
 * ## Missing-variable behavior (documented choice)
 *
 * When a referenced variable has no value (absent from the map, or an
 * empty/whitespace-only string), this engine does **not** prompt. Instead it
 * *visibly flags* the gap by replacing the placeholder with a marker,
 * `⟦name⟧` by default (see {@link MISSING_VARIABLE_MARKER}). This keeps
 * substitution a pure, synchronous, side-effect-free function that works for
 * one-click copy, keyboard-hotkey copy, and native drag-out alike (a modal
 * prompt can't participate in a browser drag-start), and it makes an unfilled
 * value obvious on the clipboard rather than silently shipping a raw `{{token}}`.
 * The editor separately surfaces which variables a snippet references and which
 * are unset, so the user can fill them in before presenting.
 */

/**
 * Characters allowed in a variable name. Kept permissive enough for realistic
 * keys (`orderId`, `test.email`, `env-url`) while still excluding whitespace and
 * the braces themselves so the scanner stays unambiguous.
 */
export const VARIABLE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/

/**
 * Master placeholder scanner. Captures the inner name with optional surrounding
 * whitespace; the captured group is re-validated against
 * {@link VARIABLE_NAME_PATTERN} before being treated as a real reference. The
 * `g` flag is required for `matchAll`/`replace`; callers must not rely on a
 * shared `lastIndex` (each use re-scans from the start).
 */
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g

/** How a missing/empty variable is rendered when substituting. */
export interface RenderSnippetOptions {
  /**
   * Render function for a placeholder whose variable is missing or empty.
   * Defaults to {@link MISSING_VARIABLE_MARKER}. Receives the bare variable
   * name (already trimmed/validated).
   */
  onMissing?: (name: string) => string
}

/** Default visible marker for an unfilled variable: `⟦name⟧`. */
export function MISSING_VARIABLE_MARKER(name: string): string {
  return `\u27E6${name}\u27E7`
}

/** True when `value` is a usable (non-empty, non-whitespace) variable value. */
function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Result of validating a candidate variable name (create or rename). */
export type VariableNameValidation = { ok: true; name: string } | { ok: false; error: string }

/**
 * Validate a candidate variable name for the Variables panel (#38 inline
 * guidance). Trims surrounding whitespace, then enforces the same
 * {@link VARIABLE_NAME_PATTERN} the `{{placeholder}}` scanner uses — so a name
 * the user types here can actually be referenced from snippet content — and
 * rejects collisions with an already-defined key. Pure and DOM-free so the
 * exact, actionable messages are unit-tested independently of any component and
 * a bad rename can surface guidance instead of silently reverting.
 *
 * `existing` is the set of already-defined variable names. `current`, when
 * given, is the name being renamed *from* — it is excluded from the collision
 * check so re-committing an unchanged name is allowed (and reported as ok).
 */
export function validateVariableName(
  raw: string,
  existing: Iterable<string> = [],
  options: { current?: string } = {}
): VariableNameValidation {
  const name = raw.trim()
  if (name.length === 0) {
    return { ok: false, error: 'Give this variable a name.' }
  }
  if (!VARIABLE_NAME_PATTERN.test(name)) {
    return { ok: false, error: 'Use only letters, numbers, and _ . - (no spaces).' }
  }
  if (name !== options.current && new Set(existing).has(name)) {
    return { ok: false, error: `A variable named “${name}” already exists.` }
  }
  return { ok: true, name }
}

/**
 * Substitute `{{name}}` placeholders in `content` using `vars`.
 *
 * - A placeholder whose name matches a key with a non-empty value is replaced by
 *   that value.
 * - A placeholder whose variable is missing or empty is replaced by
 *   `options.onMissing(name)` (default: the visible `⟦name⟧` marker).
 * - Text that merely *looks* like a placeholder but has an invalid name
 *   (`{{ }}`, `{{a b}}`) is left exactly as written.
 *
 * Pure and synchronous: safe to call on the clipboard-copy and drag-start paths.
 */
export function renderSnippet(
  content: string,
  vars: Record<string, string> | undefined,
  options: RenderSnippetOptions = {}
): string {
  if (!content) return content
  const values = vars ?? {}
  const onMissing = options.onMissing ?? MISSING_VARIABLE_MARKER

  return content.replace(PLACEHOLDER_PATTERN, (whole, rawName: string) => {
    const name = rawName.trim()
    // Not a valid variable reference → leave the original text untouched.
    if (!VARIABLE_NAME_PATTERN.test(name)) return whole
    const value = values[name]
    return hasValue(value) ? value : onMissing(name)
  })
}

/**
 * Extract the distinct variable names referenced by `content`, in first-seen
 * order. Invalid-looking placeholders are ignored (they aren't references).
 *
 * Used by the editor to show which variables a snippet uses and to seed the
 * deck-level variable map.
 */
export function extractVariableNames(content: string): string[] {
  if (!content) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const name = (match[1] ?? '').trim()
    if (!VARIABLE_NAME_PATTERN.test(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/** True when `content` references at least one valid `{{variable}}`. */
export function hasVariables(content: string): boolean {
  return extractVariableNames(content).length > 0
}

/**
 * Partition the variables referenced by `content` into those that currently have
 * a value in `vars` and those that don't. Handy for the editor's "this snippet
 * uses …" hint, which highlights unfilled variables.
 */
export function classifyVariables(
  content: string,
  vars: Record<string, string> | undefined
): { used: string[]; missing: string[] } {
  const values = vars ?? {}
  const used: string[] = []
  const missing: string[] = []
  for (const name of extractVariableNames(content)) {
    if (hasValue(values[name])) used.push(name)
    else missing.push(name)
  }
  return { used, missing }
}

/**
 * Collect every distinct variable name referenced across a set of snippet
 * contents, in first-seen order. Used to discover which deck-level variables are
 * actually in play (e.g. to offer "add all referenced variables").
 */
export function collectReferencedVariables(contents: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const content of contents) {
    for (const name of extractVariableNames(content)) {
      if (seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
  }
  return out
}
