/**
 * IPC channel names shared between main and renderer.
 * Keeping these centralized avoids typos and documents the surface area.
 */
export const IPC = {
  // Clipboard
  clipboardWrite: 'clipboard:write',

  // Deck persistence
  deckList: 'deck:list',
  deckLoad: 'deck:load',
  deckSave: 'deck:save',
  deckCreate: 'deck:create',
  deckDelete: 'deck:delete',
  deckExport: 'deck:export',
  deckImport: 'deck:import',

  // Window / presenter mode
  toggleAlwaysOnTop: 'window:toggleAlwaysOnTop',
  getAlwaysOnTop: 'window:getAlwaysOnTop',
  setPresenter: 'window:setPresenter',

  // Safe shutdown handshake (#38)
  /** Main → renderer: flush any pending debounced edits before the window closes. */
  appRequestFlush: 'app:requestFlush',
  /** Renderer → main: pending edits are flushed; the window may now close. */
  appFlushComplete: 'app:flushComplete',

  // Settings persistence (#8)
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // Live demo control bridge (#17)
  /** Renderer → main: read current bridge status (enabled + descriptor). */
  liveGetStatus: 'live:getStatus',
  /** Renderer → main: enable the bridge; resolves to the new status. */
  liveEnable: 'live:enable',
  /** Renderer → main: disable/revoke the bridge; resolves to the new status. */
  liveDisable: 'live:disable',
  /** Renderer → main: push a fresh runtime-state snapshot the bridge serves. */
  livePublishState: 'live:publishState',
  /** Main → renderer: apply a bridge command to the store (select/next/prev/copy/presenter). */
  liveApplyCommand: 'live:applyCommand'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
