#!/usr/bin/env node
/**
 * `cuedeck` — the headless CLI for scripting decks (#14).
 *
 * A non-GUI entry point over the shared deck core (`src/shared`) and the
 * headless deck store (`./store.ts`). It lets shells, CI, and AI agents create
 * and edit decks, snippets, and variables; validate/import/export deck files;
 * and render a plain-text running order — all without launching Electron. The
 * MCP server (#15) wraps this same layer.
 *
 * ## Design
 *  - **Dependency-light arg parsing.** A tiny hand-rolled tokenizer (see
 *    {@link parseFlags}) handles `--flag value`, `--flag=value`, and repeated
 *    positionals. No `commander`/`yargs` dependency is pulled in for what is a
 *    small, stable command surface.
 *  - **Shared core only.** All deck logic comes from `src/shared` via the store;
 *    the CLI never re-implements validation, normalization, or `{{variable}}`
 *    substitution.
 *  - **Agent-friendly I/O.** Read commands (`list`, `show`) support `--json` for
 *    machine consumption. Human output goes to stdout; diagnostics go to stderr.
 *  - **Consistent exit codes.** `0` on success; `2` on usage errors; `1` on
 *    runtime/validation failures. See {@link ExitCode}.
 *
 * ## Deck directory
 * Decks are read/written from the app's real `userData/decks` by default, or an
 * explicit `--dir <path>` / `CUEDECK_DIR` override for headless/CI use — see
 * {@link resolveDeckDir}.
 */

import { resolveDeckDir } from './deckDir'
import { DeckIoError, DeckStore } from './store'
import { renderDeckText } from './render'

/** Process exit codes, kept consistent across every command. */
export const ExitCode = {
  /** Command succeeded. */
  Ok: 0,
  /** A runtime or validation failure (e.g. deck not found, invalid file). */
  Failure: 1,
  /** The command was invoked incorrectly (unknown command, missing arg). */
  Usage: 2
} as const

/** A parsed command line: leading positionals plus a flag map. */
interface ParsedArgs {
  positionals: string[]
  flags: Map<string, string | boolean>
}

/** Flags that take a value (everything else is treated as a boolean switch). */
const VALUE_FLAGS = new Set(['dir', 'title', 'notes', 'label', 'content', 'out'])

/**
 * Tiny, dependency-free argument parser.
 *
 * Supports `--flag value`, `--flag=value`, and boolean `--flag`. Flags listed in
 * {@link VALUE_FLAGS} consume the next token as their value when `=` isn't used.
 * A lone `-` is preserved as a positional (used by `add-snippet` to mean
 * "read content from stdin"). Everything before/after flags is collected in
 * order as positionals.
 */
export function parseFlags(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags = new Map<string, string | boolean>()

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const body = token.slice(2)
      const eq = body.indexOf('=')
      if (eq >= 0) {
        flags.set(body.slice(0, eq), body.slice(eq + 1))
      } else if (VALUE_FLAGS.has(body)) {
        const next = argv[i + 1]
        // Allow `-` (stdin sentinel) as a value; only treat a following token as
        // the value when it isn't another `--flag`.
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(body, next)
          i++
        } else {
          flags.set(body, '')
        }
      } else {
        flags.set(body, true)
      }
    } else {
      positionals.push(token)
    }
  }

  return { positionals, flags }
}

/** Read a string-valued flag, or `undefined` when absent/boolean. */
function strFlag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags.get(name)
  return typeof v === 'string' ? v : undefined
}

/** True when a boolean switch (e.g. `--json`) is present. */
function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name)
}

function out(line = ''): void {
  process.stdout.write(line + '\n')
}

function err(line: string): void {
  process.stderr.write(line + '\n')
}

/** Read all of stdin as UTF-8 text (used for `add-snippet … -`). */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/** Build the store for this invocation, honoring `--dir` / `CUEDECK_DIR`. */
function storeFor(args: ParsedArgs): DeckStore {
  return new DeckStore(resolveDeckDir(strFlag(args, 'dir')))
}

/** A thrown usage error — reported with exit code 2 and a hint. */
class UsageError extends Error {}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

async function cmdList(args: ParsedArgs): Promise<number> {
  const summaries = await storeFor(args).list()
  if (hasFlag(args, 'json')) {
    out(JSON.stringify(summaries, null, 2))
    return ExitCode.Ok
  }
  if (summaries.length === 0) {
    out('No decks found.')
    return ExitCode.Ok
  }
  for (const s of summaries) {
    out(`${s.id}  ${s.cardCount} card${s.cardCount === 1 ? '' : 's'}  ${s.updatedAt}  ${s.name}`)
  }
  return ExitCode.Ok
}

async function cmdCreate(args: ParsedArgs): Promise<number> {
  const name = args.positionals[0]
  if (!name) throw new UsageError('create <name>: a deck name is required.')
  const deck = await storeFor(args).create(name)
  out(deck.id)
  return ExitCode.Ok
}

async function cmdShow(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0]
  if (!id) throw new UsageError('show <deckId>: a deck id is required.')
  const deck = await storeFor(args).load(id)
  if (!deck) {
    err(`Deck "${id}" not found.`)
    return ExitCode.Failure
  }
  if (hasFlag(args, 'json')) {
    out(JSON.stringify(deck, null, 2))
    return ExitCode.Ok
  }
  const snippetCount = deck.cards.reduce((n, c) => n + c.snippets.length, 0)
  const varCount = Object.keys(deck.variables ?? {}).length
  out(`Name:      ${deck.name}`)
  out(`Id:        ${deck.id}`)
  out(`Cards:     ${deck.cards.length}`)
  out(`Snippets:  ${snippetCount}`)
  out(`Variables: ${varCount}`)
  out(`Updated:   ${deck.updatedAt}`)
  out(`Version:   ${deck.schemaVersion}`)
  return ExitCode.Ok
}

async function cmdAddCard(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0]
  if (!id) throw new UsageError('add-card <deckId> --title <t> [--notes <n>]: deck id required.')
  const title = strFlag(args, 'title')
  if (title === undefined) throw new UsageError('add-card: --title <t> is required.')

  const store = storeFor(args)
  const deck = await store.load(id)
  if (!deck) {
    err(`Deck "${id}" not found.`)
    return ExitCode.Failure
  }
  const { generateId } = await import('../shared')
  const cardId = generateId()
  deck.cards.push({ id: cardId, title, notes: strFlag(args, 'notes') ?? '', snippets: [] })
  await store.save(deck)
  out(cardId)
  return ExitCode.Ok
}

async function cmdAddSnippet(args: ParsedArgs): Promise<number> {
  const [deckId, cardId] = args.positionals
  if (!deckId || !cardId) {
    throw new UsageError('add-snippet <deckId> <cardId> --label <l> --content <c|->: ids required.')
  }
  const label = strFlag(args, 'label')
  if (label === undefined) throw new UsageError('add-snippet: --label <l> is required.')

  let content = strFlag(args, 'content')
  if (content === undefined) throw new UsageError('add-snippet: --content <c|-> is required.')
  // `--content -` (or a bare `-` positional) reads the snippet body from stdin.
  if (content === '-' || args.positionals.includes('-')) {
    content = await readStdin()
  }

  const store = storeFor(args)
  const deck = await store.load(deckId)
  if (!deck) {
    err(`Deck "${deckId}" not found.`)
    return ExitCode.Failure
  }
  const card = deck.cards.find((c) => c.id === cardId)
  if (!card) {
    err(`Card "${cardId}" not found in deck "${deckId}".`)
    return ExitCode.Failure
  }
  const { generateId } = await import('../shared')
  const snippetId = generateId()
  card.snippets.push({ id: snippetId, label, content })
  await store.save(deck)
  out(snippetId)
  return ExitCode.Ok
}

async function cmdSetVar(args: ParsedArgs): Promise<number> {
  const [deckId, name, value] = args.positionals
  if (!deckId || !name || value === undefined) {
    throw new UsageError('set-var <deckId> <name> <value>: deck id, name, and value are required.')
  }
  const store = storeFor(args)
  const deck = await store.load(deckId)
  if (!deck) {
    err(`Deck "${deckId}" not found.`)
    return ExitCode.Failure
  }
  const variables = { ...(deck.variables ?? {}) }
  variables[name] = value
  await store.save({ ...deck, variables })
  out(`${name}=${value}`)
  return ExitCode.Ok
}

async function cmdImport(args: ParsedArgs): Promise<number> {
  const file = args.positionals[0]
  if (!file) throw new UsageError('import <file.cuedeck.json>: a file path is required.')
  const deck = await storeFor(args).importFile(file)
  out(deck.id)
  return ExitCode.Ok
}

async function cmdExport(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0]
  if (!id) throw new UsageError('export <deckId> [--out <file>]: a deck id is required.')
  const outFile = strFlag(args, 'out')
  const json = await storeFor(args).exportDeck(id, outFile)
  if (outFile) {
    err(`Wrote ${outFile}`)
  } else {
    process.stdout.write(json)
  }
  return ExitCode.Ok
}

async function cmdValidate(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0]
  if (!target) throw new UsageError('validate <file|deckId>: a file path or deck id is required.')

  const { validateDeck } = await import('../shared')
  const { promises: fs } = await import('fs')

  // Decide whether the argument is a file on disk or a deck id in the store.
  let parsed: unknown
  let source: string
  let looksLikeFile = false
  try {
    const stat = await fs.stat(target)
    looksLikeFile = stat.isFile()
  } catch {
    looksLikeFile = false
  }

  if (looksLikeFile) {
    source = target
    let raw: string
    try {
      raw = await fs.readFile(target, 'utf-8')
    } catch (e) {
      err(`Could not read "${target}": ${(e as Error).message}`)
      return ExitCode.Failure
    }
    try {
      parsed = JSON.parse(raw)
    } catch {
      err(`"${target}" is not valid JSON.`)
      return ExitCode.Failure
    }
  } else {
    source = `deck "${target}"`
    const deck = await storeFor(args).load(target)
    if (!deck) {
      err(`"${target}" is neither an existing file nor a known deck id.`)
      return ExitCode.Failure
    }
    parsed = deck
  }

  const result = validateDeck(parsed)
  if (result.ok) {
    out(`${source} is a valid CueDeck (schema v${result.deck.schemaVersion}).`)
    return ExitCode.Ok
  }
  err(`${source} is invalid:`)
  for (const e of result.errors) err(`  - ${e}`)
  return ExitCode.Failure
}

async function cmdRender(args: ParsedArgs): Promise<number> {
  const id = args.positionals[0]
  if (!id) throw new UsageError('render <deckId>: a deck id is required.')
  const deck = await storeFor(args).load(id)
  if (!deck) {
    err(`Deck "${id}" not found.`)
    return ExitCode.Failure
  }
  out(renderDeckText(deck))
  return ExitCode.Ok
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

const COMMANDS: Record<string, (args: ParsedArgs) => Promise<number>> = {
  list: cmdList,
  create: cmdCreate,
  show: cmdShow,
  'add-card': cmdAddCard,
  'add-snippet': cmdAddSnippet,
  'set-var': cmdSetVar,
  import: cmdImport,
  export: cmdExport,
  validate: cmdValidate,
  render: cmdRender
}

const USAGE = `cuedeck — headless CLI for scripting demo decks

Usage: cuedeck <command> [args] [--dir <path>]

Commands:
  list [--json]                                  List decks (id, cards, updatedAt, name).
  create <name>                                  Create a deck; prints its id.
  show <deckId> [--json]                         Human summary, or full deck JSON with --json.
  add-card <deckId> --title <t> [--notes <n>]    Append a card; prints its id.
  add-snippet <deckId> <cardId> --label <l> --content <c|->
                                                 Append a snippet ("-" reads content from stdin).
  set-var <deckId> <name> <value>                Set a deck-level variable.
  import <file.cuedeck.json>                      Validate + import (new id); prints the id.
  export <deckId> [--out <file>]                  Write deck JSON (stdout if no --out).
  validate <file|deckId>                          Validate; nonzero exit on failure.
  render <deckId>                                 Plain-text running order (titles, notes, snippets).

Global:
  --dir <path>     Deck directory (overrides $CUEDECK_DIR and the default userData path).
  --json           Machine-readable output on read commands (list, show).
  -h, --help       Show this help.

Environment:
  CUEDECK_DIR      Deck directory override (used when --dir is not given).

Exit codes: 0 = ok, 1 = failure, 2 = usage error.`

/** Program entry: parse argv, dispatch, and resolve to an exit code. */
export async function run(argv: string[]): Promise<number> {
  const command = argv[0]

  if (!command || command === '-h' || command === '--help' || command === 'help') {
    out(USAGE)
    // `--help`/`help` is success; a missing command is a usage error.
    return command ? ExitCode.Ok : ExitCode.Usage
  }

  const handler = COMMANDS[command]
  if (!handler) {
    err(`Unknown command: ${command}\n`)
    err(USAGE)
    return ExitCode.Usage
  }

  const args = parseFlags(argv.slice(1))
  if (hasFlag(args, 'help')) {
    out(USAGE)
    return ExitCode.Ok
  }

  try {
    return await handler(args)
  } catch (e) {
    if (e instanceof UsageError) {
      err(`Usage: ${e.message}`)
      return ExitCode.Usage
    }
    if (e instanceof DeckIoError) {
      err(e.message)
      return ExitCode.Failure
    }
    err(`Error: ${(e as Error).message}`)
    return ExitCode.Failure
  }
}

// Execute only when run as a program (not when imported by tests).
// `import.meta.url` matches the invoked script path under Node's ESM loader.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      process.stderr.write(`Fatal: ${(e as Error).message}\n`)
      process.exitCode = ExitCode.Failure
    })
}
