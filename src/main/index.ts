import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { PRESENTER_WINDOW_SIZE } from '../shared/presenter'
import { registerDeckHandlers } from './deckStore'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

/**
 * Window state captured when entering Presenter Mode so it can be restored on
 * exit. `null` while in normal edit mode.
 */
let prePresenterState: { bounds: Electron.Rectangle; alwaysOnTop: boolean } | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#0f1117',
    title: 'CueDeck',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
      win.setAlwaysOnTop(true, 'floating')
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

app.whenReady().then(() => {
  registerCoreHandlers()
  registerDeckHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
