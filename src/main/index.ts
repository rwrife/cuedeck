import { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { PRESENTER_WINDOW_SIZE } from '../shared/presenter'
import { resolveTheme } from '../shared/settings'
import { registerDeckHandlers } from './deckStore'
import { getSettingsSync, initSettings, registerSettingsHandlers } from './settingsStore'
import { registerLiveControlHandlers } from './liveControlStore'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

/**
 * Window state captured when entering Presenter Mode so it can be restored on
 * exit. `null` while in normal edit mode.
 */
let prePresenterState: { bounds: Electron.Rectangle; alwaysOnTop: boolean } | null = null

function createWindow(): void {
  // Match the initial window background to the saved theme so there's no
  // light-on-dark (or dark-on-light) flash before the renderer paints.
  const applied = resolveTheme(getSettingsSync().theme, nativeTheme.shouldUseDarkColors)
  const backgroundColor = applied === 'light' ? '#f5f6f8' : '#0f1117'

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor,
    title: 'CueDeck',
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
