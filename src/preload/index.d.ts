import type { CueDeckApi } from './index'

declare global {
  interface Window {
    cuedeck: CueDeckApi
  }
}

export {}
