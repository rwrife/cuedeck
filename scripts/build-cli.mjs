/**
 * Build the headless `cuedeck` CLI (#14).
 *
 * electron-vite only builds the app's main/preload/renderer bundles, so the CLI
 * gets its own tiny esbuild step here. We bundle `src/cli/index.ts` — pulling in
 * the shared deck core from `src/shared` — into a single ESM file at
 * `out/cli/index.js`, which is what `package.json`'s `bin` points at.
 *
 * Why esbuild: it's already present in the toolchain (a Vite dependency), is
 * dependency-light, and produces a fast, self-contained bundle. We keep Node
 * built-ins external (they're provided by the runtime) and bundle everything
 * else so the published bin has no `node_modules` requirement.
 *
 * Run via `npm run build:cli` (also invoked as part of `npm run build`).
 */

import { build } from 'esbuild'
import { chmod } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outfile = resolve(root, 'out/cli/index.js')

await build({
  entryPoints: [resolve(root, 'src/cli/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // Node built-ins stay external; the shared core is bundled in.
  packages: 'external',
  // The CLI entry (`src/cli/index.ts`) already starts with a `#!/usr/bin/env
  // node` shebang; esbuild preserves that leading hashbang, so we must NOT add a
  // banner here or the bundle would get a second shebang on line 2 (a syntax
  // error under Node's ESM loader).
  logLevel: 'info'
})

// Make the emitted bin executable (npm also does this from the `bin` field on
// install, but this keeps a locally-built bin runnable via its path).
await chmod(outfile, 0o755)

process.stdout.write(`Built CLI → ${outfile}\n`)
