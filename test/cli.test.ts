/**
 * End-to-end + unit tests for the headless `cuedeck` CLI (#14).
 *
 * The E2E suite builds the CLI bundle once and then drives the real binary as a
 * child process against a throwaway `--dir`, exercising the full authoring
 * lifecycle an agent or script would use:
 *
 *   create → add-card → add-snippet → set-var → export → validate → render
 *
 * plus import round-tripping, `--json` output, and exit-code behavior. Driving
 * the built bin (rather than importing functions) is deliberate: it proves the
 * bundle actually runs headless under Node with no Electron, that the shebang /
 * ESM output is valid, and that argument parsing and process exit codes work as
 * a user would experience them.
 *
 * A second suite unit-tests the pure helpers (`resolveDeckDir`, `renderDeckText`,
 * `parseFlags`) directly for fast, cross-platform coverage without spawning.
 */

import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolveDeckDir, userDataDir, type DeckDirEnv } from '../src/cli/deckDir'
import { renderDeckText } from '../src/cli/render'
import { parseFlags } from '../src/cli/index'
import { validateDeck, type Deck } from '../src/shared'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliBin = join(repoRoot, 'out/cli/index.js')

/* -------------------------------------------------------------------------- */
/* E2E: drive the built bin                                                   */
/* -------------------------------------------------------------------------- */

describe('cuedeck CLI (end-to-end against a temp --dir)', () => {
  let workDir: string

  /** Run the CLI bin, returning { stdout, status }. `input` feeds stdin. */
  function cli(
    args: string[],
    opts: { input?: string; expectFail?: boolean } = {}
  ): { stdout: string; status: number } {
    try {
      const stdout = execFileSync('node', [cliBin, ...args], {
        cwd: repoRoot,
        encoding: 'utf-8',
        input: opts.input,
        // Isolate every run in the temp deck dir; no real userData is touched.
        env: { ...process.env, CUEDECK_DIR: workDir }
      })
      return { stdout, status: 0 }
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string }
      if (!opts.expectFail) {
        throw new Error(
          `cuedeck ${args.join(' ')} exited ${err.status}\n` +
            `stdout: ${err.stdout}\nstderr: ${err.stderr}`
        )
      }
      return { stdout: err.stdout ?? '', status: err.status ?? -1 }
    }
  }

  beforeAll(() => {
    // Build the CLI bundle so the E2E test runs the real artifact even when
    // `npm test` is invoked on its own (without a prior `npm run build`).
    execFileSync('node', ['scripts/build-cli.mjs'], { cwd: repoRoot, stdio: 'ignore' })
    workDir = mkdtempSync(join(tmpdir(), 'cuedeck-cli-'))
  })

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  it('runs the full authoring lifecycle and renders substituted snippets', () => {
    // create → prints a deck id
    const deckId = cli(['create', 'Product Launch']).stdout.trim()
    expect(deckId).toMatch(/[0-9a-f-]{36}/)

    // add-card → prints a card id
    const cardId = cli([
      'add-card',
      deckId,
      '--title',
      'Kickoff',
      '--notes',
      'Welcome the audience'
    ]).stdout.trim()
    expect(cardId).toMatch(/[0-9a-f-]{36}/)

    // add-snippet (inline content with a variable)
    const snippetId = cli([
      'add-snippet',
      deckId,
      cardId,
      '--label',
      'Greeting',
      '--content',
      'Hi {{name}}, welcome!'
    ]).stdout.trim()
    expect(snippetId).toMatch(/[0-9a-f-]{36}/)

    // add-snippet (content from stdin via "-")
    cli(['add-snippet', deckId, cardId, '--label', 'Body', '--content', '-'], {
      input: 'multi\nline body\n'
    })

    // set-var → the variable used by the greeting snippet
    cli(['set-var', deckId, 'name', 'Ada'])

    // list (human) shows the deck; list --json is machine-readable
    const listHuman = cli(['list']).stdout
    expect(listHuman).toContain(deckId)
    expect(listHuman).toContain('Product Launch')

    const listJson = JSON.parse(cli(['list', '--json']).stdout) as Array<{
      id: string
      cardCount: number
    }>
    const entry = listJson.find((d) => d.id === deckId)
    expect(entry).toBeDefined()
    expect(entry?.cardCount).toBe(1)

    // show --json returns the full, valid deck
    const shown = JSON.parse(cli(['show', deckId, '--json']).stdout) as Deck
    expect(validateDeck(shown).ok).toBe(true)
    expect(shown.cards[0].snippets).toHaveLength(2)
    expect(shown.variables).toEqual({ name: 'Ada' })

    // render resolves {{name}} → Ada in the plain-text running order
    const rendered = cli(['render', deckId]).stdout
    expect(rendered).toContain('1. Kickoff')
    expect(rendered).toContain('Welcome the audience')
    expect(rendered).toContain('Hi Ada, welcome!')
    expect(rendered).not.toContain('{{name}}')

    // export to a file, then validate that file
    const exportPath = join(workDir, 'launch.cuedeck.json')
    cli(['export', deckId, '--out', exportPath])
    const exported = JSON.parse(readFileSync(exportPath, 'utf-8')) as Deck
    expect(exported.id).toBe(deckId)

    const validateOut = cli(['validate', exportPath])
    expect(validateOut.status).toBe(0)
    expect(validateOut.stdout).toContain('valid CueDeck')

    // import the exported file → a NEW id (never collides), still valid
    const importedId = cli(['import', exportPath]).stdout.trim()
    expect(importedId).toMatch(/[0-9a-f-]{36}/)
    expect(importedId).not.toBe(deckId)

    const importedShown = JSON.parse(cli(['show', importedId, '--json']).stdout) as Deck
    expect(validateDeck(importedShown).ok).toBe(true)
    expect(importedShown.cards[0].snippets).toHaveLength(2)
  })

  it('export without --out writes deck JSON to stdout', () => {
    const deckId = cli(['create', 'Stdout Deck']).stdout.trim()
    const stdout = cli(['export', deckId]).stdout
    const parsed = JSON.parse(stdout) as Deck
    expect(parsed.id).toBe(deckId)
    expect(parsed.name).toBe('Stdout Deck')
  })

  it('uses exit codes: 0 ok, 1 failure, 2 usage', () => {
    // Missing deck → failure (1)
    const missing = cli(['show', 'does-not-exist'], { expectFail: true })
    expect(missing.status).toBe(1)

    // Missing required argument → usage error (2)
    const usage = cli(['create'], { expectFail: true })
    expect(usage.status).toBe(2)

    // Unknown command → usage error (2)
    const unknown = cli(['frobnicate'], { expectFail: true })
    expect(unknown.status).toBe(2)

    // validate on an invalid file → failure (1)
    const badFile = join(workDir, 'bad.json')
    writeFileSync(badFile, '{"not":"a deck"}', 'utf-8')
    const invalid = cli(['validate', badFile], { expectFail: true })
    expect(invalid.status).toBe(1)
  })
})

/* -------------------------------------------------------------------------- */
/* Unit: pure helpers                                                         */
/* -------------------------------------------------------------------------- */

describe('resolveDeckDir — headless path resolution', () => {
  const home = '/home/tester'

  function env(over: Partial<DeckDirEnv>): DeckDirEnv {
    return {
      platform: 'linux',
      env: {},
      home,
      ...over
    }
  }

  it('prefers an explicit --dir override above everything', () => {
    const e = env({ env: { CUEDECK_DIR: '/from/env' } })
    expect(resolveDeckDir('/explicit/dir', e)).toBe('/explicit/dir')
  })

  it('falls back to CUEDECK_DIR when no --dir is given', () => {
    const e = env({ env: { CUEDECK_DIR: '/from/env' } })
    expect(resolveDeckDir(undefined, e)).toBe('/from/env')
  })

  it('defaults to the replicated Electron userData/decks per platform', () => {
    // Linux → ~/.config/cuedeck/decks (honors XDG when set)
    expect(resolveDeckDir(undefined, env({ platform: 'linux' }))).toBe(
      '/home/tester/.config/cuedeck/decks'
    )
    expect(
      resolveDeckDir(undefined, env({ platform: 'linux', env: { XDG_CONFIG_HOME: '/xdg' } }))
    ).toBe('/xdg/cuedeck/decks')

    // macOS → ~/Library/Application Support/cuedeck/decks
    expect(resolveDeckDir(undefined, env({ platform: 'darwin' }))).toBe(
      '/home/tester/Library/Application Support/cuedeck/decks'
    )

    // Windows → %APPDATA%/cuedeck/decks. `join` uses the host path separator
    // (POSIX on the CI runner), so assert structurally rather than hardcoding a
    // Windows-only separator.
    const win = resolveDeckDir(
      undefined,
      env({ platform: 'win32', env: { APPDATA: '/appdata/Roaming' } })
    )
    expect(win).toBe(join('/appdata/Roaming', 'cuedeck', 'decks'))

    // Windows with APPDATA unset falls back to <home>/AppData/Roaming.
    const winFallback = resolveDeckDir(undefined, env({ platform: 'win32' }))
    expect(winFallback).toBe(join(home, 'AppData', 'Roaming', 'cuedeck', 'decks'))
  })

  it('userDataDir appends the app name to the base appData dir', () => {
    expect(userDataDir(env({ platform: 'linux' }))).toBe('/home/tester/.config/cuedeck')
  })
})

describe('renderDeckText — plain-text running order', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Demo',
    schemaVersion: 2,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    variables: { who: 'World' },
    cards: [
      {
        id: 'c1',
        title: 'Intro',
        notes: 'Talk\nmore',
        snippets: [
          { id: 's1', label: 'Hello', content: 'Hello {{who}}' },
          { id: 's2', label: 'Missing', content: 'Bye {{gone}}' }
        ]
      }
    ]
  }

  it('numbers cards, includes notes, and substitutes snippet variables', () => {
    const text = renderDeckText(deck)
    expect(text).toContain('Demo')
    expect(text).toContain('1 card')
    expect(text).toContain('1. Intro')
    expect(text).toContain('Hello World')
    // A missing variable shows the visible marker, not a raw token.
    expect(text).toContain('\u27E6gone\u27E7')
    expect(text).not.toContain('{{who}}')
  })

  it('handles an empty deck', () => {
    const empty: Deck = { ...deck, cards: [], variables: {} }
    const text = renderDeckText(empty)
    expect(text).toContain('0 cards')
    expect(text).toContain('(no cards)')
  })
})

describe('parseFlags — tiny arg parser', () => {
  it('parses value flags (space and =), booleans, and positionals', () => {
    const { positionals, flags } = parseFlags([
      'deck1',
      '--title',
      'My Card',
      '--notes=line',
      '--json'
    ])
    expect(positionals).toEqual(['deck1'])
    expect(flags.get('title')).toBe('My Card')
    expect(flags.get('notes')).toBe('line')
    expect(flags.get('json')).toBe(true)
  })

  it('keeps a bare "-" as a positional (stdin sentinel)', () => {
    const { positionals } = parseFlags(['deck1', 'card1', '--label', 'L', '--content', '-'])
    expect(positionals).toEqual(['deck1', 'card1'])
    const { flags } = parseFlags(['--content', '-'])
    expect(flags.get('content')).toBe('-')
  })
})
