import type { CueDeckApi } from '../../preload'

/**
 * Makes the preload-exposed API visible to the renderer's TypeScript.
 * The actual object is injected at runtime via contextBridge.
 */
declare global {
  interface Window {
    cuedeck: CueDeckApi
  }
}

export {}
