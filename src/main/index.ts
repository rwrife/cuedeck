import { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme, Menu } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { PRESENTER_WINDOW_SIZE } from '../shared/presenter'
import { resolveTheme } from '../shared/settings'
import { registerDeckHandlers } from './deckStore'
import { getSettingsSync, initSettings, registerSettingsHandlers } from './settingsStore'
import { registerLiveControlHandlers } from './liveControlStore'
import { buildApplicationMenuTemplate, resolveWindowBackgroundColor } from './windowChrome'
import { CloseGuard } from './closeCoordinator'

const isDev = !app.isPackaged

// Only meaningful in dev: packaged builds get their window/taskbar/dock icon
// baked in by electron-builder (see `build.*.icon` in package.json) from this
// same source file, so setting it again at runtime would be redundant there.
// In dev the app runs as plain `electron.exe`/Electron.app, which otherwise
// shows the generic Electron icon.
const devIconPath = join(__dirname, '../../build/icon.png')

let mainWindow: BrowserWindow | null = null

/**
 * Window state captured when entering Presenter Mode so it can be restored on
 * exit. `null` while in normal edit mode.
 */
let prePresenterState: { bounds: Electron.Rectangle; alwaysOnTop: boolean } | null = null

/**
 * Guards window close behind a renderer flush (#38): an edit made immediately
 * before hitting close must not be dropped by the save debounce. The first
 * close is deferred while we ask the renderer to flush; once it acks (or a
 * safety timeout fires) the close is allowed through.
 */
const closeGuard = new CloseGuard()

/**
 * Set once the app is genuinely quitting (Cmd+Q / `app.quit()`), via the
 * `before-quit` event. It tells the window `close` handler that the deferred
 * flush must resume the *quit*, not just re-close the window — otherwise on
 * macOS the flushed close would cancel the quit and leave the app in the dock.
 */
let appIsQuitting = false

/** How long to wait for the renderer's flush ack before closing anyway (ms). */
const FLUSH_TIMEOUT_MS = 4000

/**
 * Ask the renderer to flush pending edits, then resume shutdown once it acks or
 * the safety timeout elapses. The resume action comes from the pure
 * {@link CloseGuard}: `'quit'` re-issues the app quit (so macOS actually exits),
 * `'close'` re-issues the window close, and `'none'` ignores a late/spurious
 * signal. Idempotent per close attempt so duplicate close events and late acks
 * are harmless.
 */
function flushThenClose(win: BrowserWindow): void {
  let settled = false
  const finish = (fromTimeout: boolean): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    ipcMain.removeListener(IPC.appFlushComplete, onAck)
    const res = fromTimeout ? closeGuard.onFlushTimeout() : closeGuard.onFlushComplete()
    if (res.resume === 'quit') {
      app.quit()
    } else if (res.resume === 'close' && !win.isDestroyed()) {
      win.close()
    }
  }
  const onAck = (evt: Electron.IpcMainEvent): void => {
    if (evt.sender === win.webContents) finish(false)
  }
  const timer = setTimeout(() => finish(true), FLUSH_TIMEOUT_MS)
  ipcMain.on(IPC.appFlushComplete, onAck)
  win.webContents.send(IPC.appRequestFlush)
}

function createWindow(): void {
  // A fresh window starts a fresh shutdown handshake (e.g. macOS re-activate
  // after all windows were closed) so the next close still flushes first.
  closeGuard.reset()
  appIsQuitting = false

  // Match the initial window background to the saved theme so there's no
  // light-on-dark (or dark-on-light) flash before the renderer paints.
  const applied = resolveTheme(getSettingsSync().theme, nativeTheme.shouldUseDarkColors)
  const backgroundColor = resolveWindowBackgroundColor(applied)

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor,
    title: 'CueDeck',
    ...(isDev ? { icon: devIconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Safe shutdown (#38): defer the first close until the renderer has flushed
  // any pending debounced edits, so the last change is never silently lost. The
  // `appIsQuitting` flag (set by `before-quit`) makes a Cmd+Q/app.quit resume as
  // a real quit rather than only re-closing the window.
  mainWindow.on('close', (event) => {
    const win = mainWindow
    if (!win) return
    const decision = closeGuard.requestClose(appIsQuitting)
    if (decision.proceed) return
    event.preventDefault()
    if (decision.shouldFlush) flushThenClose(win)
  })

  // Open external links in the default browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerCoreHandlers(): void {
  // Clipboard write — the heart of the app.
  ipcMain.handle(IPC.clipboardWrite, (_evt, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  // Always-on-top toggle for presenter mode.
  ipcMain.handle(IPC.toggleAlwaysOnTop, () => {
    if (!mainWindow) return false
    const next = !mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(next, 'floating')
    return next
  })

  ipcMain.handle(IPC.getAlwaysOnTop, () => {
    return mainWindow?.isAlwaysOnTop() ?? false
  })

  // Enter/exit Presenter Mode. Entering remembers the current bounds + on-top
  // state, then shrinks the window to a compact size and pins it always-on-top.
  // Exiting restores exactly what was captured on entry. Returns the resulting
  // always-on-top state so the renderer can stay in sync.
  ipcMain.handle(IPC.setPresenter, (_evt, present: boolean) => {
    const win = mainWindow
    if (!win) return false

    if (present) {
      // Capture once; a second "enter" while already presenting is a no-op so we
      // never overwrite the remembered edit-mode bounds with compact ones.
      if (!prePresenterState) {
        prePresenterState = {
          bounds: win.getBounds(),
          alwaysOnTop: win.isAlwaysOnTop()
        }
      }
      // Honor the user's "always-on-top by default" preference (#8): when it's
      // off we leave the current on-top state untouched so presenting no longer
      // force-pins the window. It defaults to on, preserving prior behavior.
      if (getSettingsSync().alwaysOnTopDefault) {
        win.setAlwaysOnTop(true, 'floating')
      }
      // Keep the window anchored at its current top-left while it shrinks.
      const { x, y } = win.getBounds()
      win.setBounds({ x, y, ...PRESENTER_WINDOW_SIZE })
      return win.isAlwaysOnTop()
    }

    // Exiting: restore the captured bounds + on-top state, if we have them.
    if (prePresenterState) {
      win.setBounds(prePresenterState.bounds)
      win.setAlwaysOnTop(prePresenterState.alwaysOnTop, 'floating')
      prePresenterState = null
    }
    return win.isAlwaysOnTop()
  })
}

app.whenReady().then(async () => {
  // CueDeck has no File/View/Help commands of its own, so the generic
  // Electron default menu is irrelevant chrome on Windows/Linux — remove it.
  // macOS keeps a minimal, conventional App/Edit/Window menu since some of
  // those roles (e.g. Edit's Cut/Copy/Paste/Select All) back native text-field
  // keyboard behavior there. See `windowChrome.ts` for the pure template.
  const menuTemplate = buildApplicationMenuTemplate(process.platform)
  Menu.setApplicationMenu(menuTemplate ? Menu.buildFromTemplate(menuTemplate) : null)

  // Dev-only Dock icon; see `devIconPath` above for why packaged builds don't
  // need this.
  if (isDev && process.platform === 'darwin') {
    app.dock?.setIcon(devIconPath)
  }

  // Warm the settings cache before the window is created so the initial
  // background color + always-on-top default reflect saved preferences.
  await initSettings()
  registerCoreHandlers()
  registerDeckHandlers()
  registerSettingsHandlers()
  // Live demo control bridge (#17) — opt-in, loopback-only; nothing listens
  // until the user enables it in-app. The window factory lets it target the
  // current main window for command forwarding.
  registerLiveControlHandlers(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Record app-quit intent (Cmd+Q / app.quit()) so the window `close` handler
// resumes the actual quit after flushing instead of only re-closing the window.
// This handler intentionally does no flushing or preventDefault — it just sets a
// flag; the close handshake owns the deferral. Re-firing on the resumed quit is
// harmless (the flag is already set).
app.on('before-quit', () => {
  appIsQuitting = true
})
