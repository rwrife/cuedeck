import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { registerDeckHandlers } from './deckStore'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

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
