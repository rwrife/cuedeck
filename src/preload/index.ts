import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  Deck,
  DeckSummary,
  DeleteResult,
  DuplicateResult,
  ExportResult,
  ImportResult,
  RenameResult
} from '../shared/types'
import type { Settings } from '../shared/settings'
import type { LiveState } from '../shared/liveControl'

/**
 * Payload the main process sends to the renderer to apply a live-control
 * command (#17). The renderer applies it to the store, then replies on
 * `replyChannel` with the outcome (and, for `copySnippet`, the resolved text
 * for main to place on the clipboard).
 */
export interface LiveCommandEnvelope {
  id: number
  replyChannel: string
  message: {
    command:
      | 'selectCard'
      | 'nextCard'
      | 'prevCard'
      | 'copySnippet'
      | 'enterPresenter'
      | 'exitPresenter'
    index?: number
    cardId?: string
    snippetId?: string
  }
}

/** The renderer's reply to a {@link LiveCommandEnvelope}. */
export type LiveCommandReply =
  | { ok: false; reason: 'no_deck_open' | 'card_not_found' | 'snippet_not_found'; message: string }
  | { ok: true; copy?: { snippetId: string; label: string; copied: string } }

/** In-app live-control status surfaced to the renderer for the toggle/indicator. */
export interface LiveControlStatus {
  enabled: boolean
  descriptor: {
    host: string
    port: number
    token: string
    version: number
    pid: number
  } | null
}

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
    remove: (id: string): Promise<DeleteResult> => ipcRenderer.invoke(IPC.deckDelete, id),
    export: (id: string): Promise<ExportResult> => ipcRenderer.invoke(IPC.deckExport, id),
    import: (): Promise<ImportResult> => ipcRenderer.invoke(IPC.deckImport),
    /** Rename a deck in place (#34); never a native dialog, so always ok/error. */
    rename: (id: string, name: string): Promise<RenameResult> =>
      ipcRenderer.invoke(IPC.deckRename, id, name),
    /** Duplicate a deck (#34), producing a new, independently-named copy. */
    duplicate: (id: string): Promise<DuplicateResult> => ipcRenderer.invoke(IPC.deckDuplicate, id)
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
  /**
   * Safe shutdown handshake (#38). Before the window actually closes, the main
   * process asks the renderer to flush any pending debounced edits and waits for
   * the ack, so an edit made immediately before closing is never silently
   * discarded. `onFlushRequest` runs the supplied flusher, then always acks
   * (even if the flush itself fails) so shutdown can't hang.
   */
  app: {
    onFlushRequest: (handler: () => Promise<void> | void): (() => void) => {
      const listener = (): void => {
        void Promise.resolve()
          .then(handler)
          .catch(() => undefined)
          .finally(() => ipcRenderer.send(IPC.appFlushComplete))
      }
      ipcRenderer.on(IPC.appRequestFlush, listener)
      return () => ipcRenderer.removeListener(IPC.appRequestFlush, listener)
    }
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
  },
  /**
   * Live demo control bridge (#17). Opt-in, loopback-only remote control of the
   * running app for MCP clients. The renderer drives the in-app toggle/indicator
   * (`getStatus`/`enable`/`disable`), continuously `publishState`s a lightweight
   * snapshot the bridge serves, and subscribes via `onCommand` to apply incoming
   * select/next/prev/copy/presenter commands to the store.
   */
  live: {
    /** Read the current bridge status (enabled + connection descriptor). */
    getStatus: (): Promise<LiveControlStatus> => ipcRenderer.invoke(IPC.liveGetStatus),
    /** Enable the bridge (starts the loopback listener); resolves to the new status. */
    enable: (): Promise<LiveControlStatus> => ipcRenderer.invoke(IPC.liveEnable),
    /** Disable/revoke the bridge (stops listening, removes the descriptor). */
    disable: (): Promise<LiveControlStatus> => ipcRenderer.invoke(IPC.liveDisable),
    /** Push a fresh runtime-state snapshot for the bridge to serve on `getState`. */
    publishState: (state: LiveState): void => ipcRenderer.send(IPC.livePublishState, state),
    /**
     * Subscribe to incoming bridge commands. The handler applies the command and
     * returns a reply, which is sent back to main on the envelope's reply
     * channel. Returns an unsubscribe function.
     */
    onCommand: (
      handler: (message: LiveCommandEnvelope['message']) => Promise<LiveCommandReply>
    ): (() => void) => {
      const listener = (_evt: unknown, envelope: LiveCommandEnvelope): void => {
        void handler(envelope.message).then((reply) => {
          ipcRenderer.send(envelope.replyChannel, reply)
        })
      }
      ipcRenderer.on(IPC.liveApplyCommand, listener)
      return () => ipcRenderer.removeListener(IPC.liveApplyCommand, listener)
    }
  }
}

contextBridge.exposeInMainWorld('cuedeck', api)

export type CueDeckApi = typeof api
