import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { Deck, DeckSummary } from '../shared/types'

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
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.deckDelete, id)
  },
  window: {
    toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke(IPC.toggleAlwaysOnTop),
    getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke(IPC.getAlwaysOnTop)
  }
}

contextBridge.exposeInMainWorld('cuedeck', api)

export type CueDeckApi = typeof api
