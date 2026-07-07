/**
 * Generate the committed `deck.json` fixtures for the AI-authoring examples (#16).
 *
 * For every `examples/<name>/outline.json`, this runs the *real*
 * {@link DeckRepository.createDeckFromOutline} (the same code path the MCP
 * `create_deck_from_outline` tool uses) against a throwaway deck directory,
 * normalizes the volatile fields (ids/timestamps) with the shared
 * `normalizeForFixture` helper, and writes the result to
 * `examples/<name>/deck.json`.
 *
 * Because both this generator and `test/example-authoring.test.ts` use the same
 * builder and the same normalizer, the committed fixtures can never drift from
 * the code: the test rebuilds each outline and asserts it equals the fixture.
 *
 * Usage:
 *   node scripts/gen-examples.mjs           # regenerate all example deck.json
 *   node scripts/gen-examples.mjs --check   # fail if any fixture is stale
 *
 * The `--check` mode is handy in CI / pre-commit to prove the fixtures are in
 * sync without mutating the tree.
 *
 * Implementation note: the deck core is TypeScript, so we bundle a tiny entry
 * with esbuild (already in the toolchain) to a temp ESM file and import it.
 */

import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const check = process.argv.includes('--check')

/**
 * Bundle an entry that re-exports the builder + shared fixture helpers, so this
 * plain `.mjs` can drive the TypeScript core without a separate compile step.
 */
async function loadCore() {
  const entry = `
    export { DeckStore } from ${JSON.stringify(resolve(root, 'src/cli/store.ts'))}
    export { DeckRepository } from ${JSON.stringify(resolve(root, 'src/cli/deckRepository.ts'))}
    export {
      listExamples,
      loadOutline,
      normalizeForFixture
    } from ${JSON.stringify(resolve(root, 'test/support/exampleFixtures.ts'))}
  `
  const outfile = join(mkdtempSync(join(tmpdir(), 'cuedeck-gen-')), 'core.mjs')
  await build({
    stdin: { contents: entry, resolveDir: root, loader: 'ts' },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    packages: 'external',
    logLevel: 'error'
  })
  const mod = await import(pathToFileURL(outfile).href)
  rmSync(dirname(outfile), { recursive: true, force: true })
  return mod
}

const core = await loadCore()

const workDir = mkdtempSync(join(tmpdir(), 'cuedeck-gen-decks-'))
let stale = 0
try {
  for (const ex of core.listExamples(resolve(root, 'examples'))) {
    const outline = core.loadOutline(ex)
    // Fresh store per example so ids are independent and deterministic.
    const store = new core.DeckStore(join(workDir, ex.name))
    const repo = new core.DeckRepository(store)
    const built = await repo.createDeckFromOutline(outline)
    const normalized = core.normalizeForFixture(built)
    const json = `${JSON.stringify(normalized, null, 2)}\n`

    let current = null
    try {
      current = readFileSync(ex.deckPath, 'utf-8')
    } catch {
      current = null
    }

    if (check) {
      if (current !== json) {
        stale += 1
        process.stderr.write(`stale fixture: ${ex.deckPath}\n`)
      }
    } else if (current !== json) {
      writeFileSync(ex.deckPath, json, 'utf-8')
      process.stdout.write(`wrote ${ex.deckPath}\n`)
    } else {
      process.stdout.write(`up to date ${ex.deckPath}\n`)
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

if (check && stale > 0) {
  process.stderr.write(`\n${stale} example fixture(s) out of date. Run: npm run gen:examples\n`)
  process.exit(1)
}
