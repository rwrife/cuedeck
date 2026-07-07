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

  // Settings persistence (#8)
  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
