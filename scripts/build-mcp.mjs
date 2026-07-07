#!/usr/bin/env node
/**
 * Build the `cuedeck-mcp` stdio MCP server (#15).
 *
 * Like the CLI (`build-cli.mjs`), electron-vite doesn't build this headless
 * entry point, so it gets its own tiny esbuild step. We bundle
 * `src/mcp/index.ts` — pulling in the shared deck core and the shared
 * `deckRepository` — into a single ESM file at `out/mcp/index.js`, which is what
 * `package.json`'s `bin.cuedeck-mcp` points at.
 *
 * ## Why `packages: 'external'`
 * The MCP server depends on `@modelcontextprotocol/sdk` and `zod` (declared in
 * `dependencies`). We keep node_modules external — exactly like the CLI — so the
 * SDK (and its own transitive deps) are resolved from the installed package at
 * runtime rather than inlined. This keeps the bundle small, avoids pulling the
 * SDK's HTTP transport deps into a stdio-only artifact, and keeps the MCP SDK
 * entirely out of the renderer bundle (electron-vite builds that separately and
 * never imports `src/mcp`).
 *
 * Run via `npm run build:mcp` (also invoked as part of `npm run build`).
 */

import { build } from 'esbuild'
import { chmod } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outfile = resolve(root, 'out/mcp/index.js')

await build({
  entryPoints: [resolve(root, 'src/mcp/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // Node built-ins AND node_modules (the MCP SDK + zod) stay external; only our
  // own source (shared core + deckRepository) is bundled in.
  packages: 'external',
  // The MCP entry (`src/mcp/index.ts`) already starts with a `#!/usr/bin/env
  // node` shebang; esbuild preserves it, so we must NOT add a banner (that would
  // produce a second shebang and a syntax error under Node's ESM loader).
  logLevel: 'info'
})

// Make the emitted bin executable (npm also does this from the `bin` field on
// install, but this keeps a locally-built bin runnable via its path).
await chmod(outfile, 0o755)

process.stdout.write(`Built MCP server → ${outfile}\n`)
