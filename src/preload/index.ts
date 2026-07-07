import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { Deck, DeckSummary, ExportResult, ImportResult } from '../shared/types'
import type { Settings } from '../shared/settings'

/**
 * The typed API surface exposed to the renderer via contextBridge.
 * Renderer code calls window.cuedeck.* — never touches ipcRenderer directly.
 */
const api = {
  clipboard: {
    write: (text: string): Promise<boolean> => ipcRenderer.invoke(IPC.clipboardWrite, text)
  },
  decks: {
    list: (): Promise<DeckSummary[]> => ipcRenderer.invoke(IPC.deckList),
    load: (id: string): Promise<Deck | null> => ipcRenderer.invoke(IPC.deckLoad, id),
    save: (deck: Deck): Promise<Deck> => ipcRenderer.invoke(IPC.deckSave, deck),
    create: (name: string): Promise<Deck> => ipcRenderer.invoke(IPC.deckCreate, name),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.deckDelete, id),
    export: (id: string): Promise<ExportResult> => ipcRenderer.invoke(IPC.deckExport, id),
    import: (): Promise<ImportResult> => ipcRenderer.invoke(IPC.deckImport)
  },
  window: {
    toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke(IPC.toggleAlwaysOnTop),
    getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke(IPC.getAlwaysOnTop),
    /**
     * Enter/exit Presenter Mode at the window level: entering shrinks the
     * window to a compact size and pins it always-on-top (remembering the
     * prior bounds + on-top state); exiting restores them. Resolves to the
     * always-on-top state after the change.
     */
    setPresenter: (present: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.setPresenter, present)
  },
  settings: {
    /** Read the full, normalized settings object. */
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    /**
     * Persist a (possibly partial) settings patch. The main process merges it
     * onto the current settings, validates every field, writes settings.json,
     * and resolves to the resulting full settings object.
     */
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, patch)
  }
}

contextBridge.exposeInMainWorld('cuedeck', api)

export type CueDeckApi = typeof api
