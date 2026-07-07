/**
 * Electron wiring for the live demo control bridge (#17).
 *
 * Bridges the pure {@link LiveControlBridge}/{@link LiveController} (transport +
 * protocol, no Electron) to the running app:
 *
 *  - **State** is owned by the renderer's Zustand store, so the renderer
 *    continuously *publishes* a lightweight {@link LiveState} snapshot to main
 *    (via `IPC.livePublishState`) whenever the deck/active-card/presenter state
 *    changes. `getState` then answers from that cache with zero round-trip.
 *  - **Mutations** (select/next/prev/copy/enter/exitPresenter) are forwarded to
 *    the renderer (`IPC.liveApplyCommand`); after applying, the renderer copies
 *    to the clipboard through the existing main-process path and publishes fresh
 *    state. Main awaits that next publish (bounded by a timeout) and returns the
 *    resulting snapshot, so a client always sees the effect of its command.
 *  - **Descriptor** persistence writes `<userData>/live-control.json` (0600) on
 *    enable and deletes it on disable/quit, which is what the `live_*` MCP tools
 *    read to discover where + how to connect.
 *
 * Everything here is opt-in: nothing listens until the renderer calls
 * `IPC.liveEnable` (the in-app "Allow live control" toggle).
 */

import { app, clipboard, ipcMain, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

import { IPC } from '../shared/ipc'
import {
  LIVE_CONTROL_DESCRIPTOR_FILE,
  type CopyResult,
  type LiveControlDescriptor,
  type LiveState
} from '../shared/liveControl'
import {
  LiveControlBridge,
  type CommandOutcome,
  type LiveController
} from './liveControl'

/**
 * A single mutating command forwarded to the renderer. Mirrors the bridge
 * command set minus `getState` (served from cache). `copySnippet` returns the
 * resolved text so the *main* process performs the actual clipboard write
 * (reusing the app's trusted clipboard path), rather than the renderer.
 */
export interface LiveCommandMessage {
  command: 'selectCard' | 'nextCard' | 'prevCard' | 'copySnippet' | 'enterPresenter' | 'exitPresenter'
  index?: number
  cardId?: string
  snippetId?: string
}

/**
 * The renderer's reply to a {@link LiveCommandMessage}. Either the domain
 * failure (mapped to a bridge error code) or success plus, for `copySnippet`,
 * the exact resolved text to place on the clipboard.
 */
export type LiveCommandReply =
  | { ok: false; reason: 'no_deck_open' | 'card_not_found' | 'snippet_not_found'; message: string }
  | { ok: true; copy?: CopyResult }

/** Blank state used before the renderer has published anything (or with no window). */
const EMPTY_STATE: LiveState = {
  deckOpen: false,
  deckId: null,
  deckName: null,
  cardCount: 0,
  activeCardIndex: -1,
  activeCardId: null,
  presenting: false,
  snippets: [],
  cards: []
}

/**
 * Owns the cached renderer state and the IPC round-trip used to apply mutating
 * commands. Implements {@link LiveController} so it can back the bridge.
 */
class RendererLiveController implements LiveController {
  private latest: LiveState = EMPTY_STATE
  private requestSeq = 0

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  /** Update the cached snapshot from a renderer publish. */
  setState(state: LiveState): void {
    this.latest = state
  }

  async getState(): Promise<LiveState> {
    return this.latest
  }

  selectCard(selector: { index?: number; cardId?: string }): Promise<CommandOutcome<LiveState>> {
    return this.mutate({ command: 'selectCard', ...selector })
  }

  nextCard(): Promise<CommandOutcome<LiveState>> {
    return this.mutate({ command: 'nextCard' })
  }

  prevCard(): Promise<CommandOutcome<LiveState>> {
    return this.mutate({ command: 'prevCard' })
  }

  async copySnippet(selector: {
    index?: number
    snippetId?: string
  }): Promise<CommandOutcome<CopyResult>> {
    const window = this.getWindow()
    if (!window) {
      return { ok: false, reason: 'no_deck_open', message: 'No CueDeck window is open.' }
    }
    const reply = await this.invokeRenderer(window, { command: 'copySnippet', ...selector })
    if (!reply.ok) return reply
    if (!reply.copy) {
      return { ok: false, reason: 'snippet_not_found', message: 'No snippet was copied.' }
    }
    // Perform the clipboard write in main, reusing the trusted app path.
    clipboard.writeText(reply.copy.copied)
    return { ok: true, value: reply.copy }
  }

  enterPresenter(): Promise<CommandOutcome<LiveState>> {
    return this.mutate({ command: 'enterPresenter' })
  }

  exitPresenter(): Promise<CommandOutcome<LiveState>> {
    return this.mutate({ command: 'exitPresenter' })
  }

  /**
   * Forward a state-changing command to the renderer and resolve to the
   * resulting {@link LiveState} snapshot (read from the freshly-updated cache).
   */
  private async mutate(message: LiveCommandMessage): Promise<CommandOutcome<LiveState>> {
    const window = this.getWindow()
    if (!window) {
      return { ok: false, reason: 'no_deck_open', message: 'No CueDeck window is open.' }
    }
    const reply = await this.invokeRenderer(window, message)
    if (!reply.ok) return reply
    return { ok: true, value: this.latest }
  }

  /**
   * Send a command to the renderer and await its reply. Uses a per-request
   * reply channel so concurrent commands don't cross wires. Bounded by a
   * timeout so a wedged renderer can't hang the bridge.
   */
  private invokeRenderer(
    window: BrowserWindow,
    message: LiveCommandMessage
  ): Promise<LiveCommandReply> {
    const id = ++this.requestSeq
    const replyChannel = `${IPC.liveApplyCommand}:reply:${id}`

    return new Promise<LiveCommandReply>((resolve) => {
      const timer = setTimeout(() => {
        ipcMain.removeAllListeners(replyChannel)
        resolve({
          ok: false,
          reason: 'no_deck_open',
          message: 'Timed out waiting for the app to respond.'
        })
      }, 3000)

      ipcMain.once(replyChannel, (_evt, reply: LiveCommandReply) => {
        clearTimeout(timer)
        resolve(reply)
      })

      window.webContents.send(IPC.liveApplyCommand, { id, replyChannel, message })
    })
  }
}

/** Absolute path to the on-disk connection descriptor. */
function descriptorPath(): string {
  return join(app.getPath('userData'), LIVE_CONTROL_DESCRIPTOR_FILE)
}

/** Persist the descriptor as user-readable-only JSON (contains the token). */
async function writeDescriptor(descriptor: LiveControlDescriptor): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(descriptorPath(), JSON.stringify(descriptor, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

/** Remove the descriptor file, ignoring a missing file. */
async function removeDescriptor(): Promise<void> {
  try {
    await fs.rm(descriptorPath(), { force: true })
  } catch {
    // Best-effort: a missing/again-removed descriptor is fine.
  }
}

let bridge: LiveControlBridge | null = null
let controller: RendererLiveController | null = null

/** The status object returned to the renderer for the in-app indicator. */
export interface LiveControlStatus {
  enabled: boolean
  descriptor: LiveControlDescriptor | null
}

/**
 * Register live-control IPC handlers and construct the bridge (disabled until
 * the user enables it). Call once during app startup, after a window factory is
 * available so `getWindow` can resolve the current main window.
 *
 * On startup we also proactively clear any stale descriptor left by a previous
 * run that didn't shut down cleanly, so the `live_*` tools never connect to a
 * dead port.
 */
export function registerLiveControlHandlers(getWindow: () => BrowserWindow | null): void {
  controller = new RendererLiveController(getWindow)
  bridge = new LiveControlBridge(controller, writeDescriptor, removeDescriptor)

  // Clear a stale descriptor from a prior unclean shutdown (fire-and-forget).
  void removeDescriptor()

  const status = (): LiveControlStatus => ({
    enabled: bridge!.isEnabled(),
    descriptor: bridge!.descriptor()
  })

  ipcMain.handle(IPC.liveGetStatus, async (): Promise<LiveControlStatus> => status())

  ipcMain.handle(IPC.liveEnable, async (): Promise<LiveControlStatus> => {
    await bridge!.enable()
    return status()
  })

  ipcMain.handle(IPC.liveDisable, async (): Promise<LiveControlStatus> => {
    await bridge!.disable()
    return status()
  })

  // Renderer pushes a fresh state snapshot; cache it for `getState`.
  ipcMain.on(IPC.livePublishState, (_evt, state: LiveState) => {
    controller?.setState(state)
  })

  // Make sure the socket is closed and the descriptor removed on quit so no
  // stale endpoint is advertised after the app exits.
  app.on('will-quit', () => {
    void bridge?.disable()
  })
}
