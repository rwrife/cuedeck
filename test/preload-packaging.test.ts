import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('preload packaging in ESM app', () => {
  it('loads preload via a .cjs entrypoint that Electron can require()', () => {
    const mainSource = readFileSync(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8')
    expect(mainSource).toContain("preload: join(__dirname, '../preload/index.cjs')")
  })

  it('emits preload as CommonJS with a .cjs filename', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'electron.vite.config.ts'), 'utf8')
    expect(viteConfig).toContain("format: 'cjs'")
    expect(viteConfig).toContain("entryFileNames: '[name].cjs'")
  })
})
