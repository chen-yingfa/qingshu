import { readFile, writeFile } from 'node:fs/promises'
import { release } from 'node:os'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import type {
  ExportHtmlRequest,
  ExportPdfRequest,
  FileResult,
  WindowAction,
} from '../../src/types/electron'

const preload = join(__dirname, '../preload/index.js')
const indexHtml = join(__dirname, '../../dist/index.html')

let win: BrowserWindow | null = null

async function selectSavePath(
  path: string | undefined,
  options: Electron.SaveDialogOptions,
): Promise<FileResult | { canceled: false; path: string }> {
  if (path) return { canceled: false, path }

  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }
  return { canceled: false, path: result.filePath }
}

ipcMain.handle('qingshu:open-file', async (): Promise<FileResult> => {
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return { canceled: true }

  return {
    canceled: false,
    path,
    content: await readFile(path, 'utf8'),
  }
})

ipcMain.handle(
  'qingshu:save-file',
  async (
    _event: IpcMainInvokeEvent,
    request: { path?: string; content: string },
  ): Promise<FileResult> => {
    const target = await selectSavePath(request.path, {
      title: 'Save Markdown',
      defaultPath: 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (target.canceled) return target

    await writeFile(target.path, request.content, 'utf8')
    return target
  },
)

ipcMain.handle(
  'qingshu:export-html',
  async (_event: IpcMainInvokeEvent, request: ExportHtmlRequest): Promise<FileResult> => {
    const target = await selectSavePath(request.path, {
      title: 'Export HTML',
      defaultPath: 'Untitled.html',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    })
    if (target.canceled) return target

    await writeFile(target.path, request.html, 'utf8')
    return target
  },
)

ipcMain.handle(
  'qingshu:export-pdf',
  async (event: IpcMainInvokeEvent, request: ExportPdfRequest = {}): Promise<FileResult> => {
    const target = await selectSavePath(request.path, {
      title: 'Export PDF',
      defaultPath: 'Untitled.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (target.canceled) return target

    const pdf = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
    })
    await writeFile(target.path, pdf)
    return target
  },
)

ipcMain.handle(
  'qingshu:window-action',
  (event: IpcMainInvokeEvent, action: WindowAction): void => {
    const target = BrowserWindow.fromWebContents(event.sender)
    if (!target) return

    switch (action) {
      case 'minimize':
        target.minimize()
        break
      case 'toggle-maximize':
        target.isMaximized() ? target.unmaximize() : target.maximize()
        break
      case 'close':
        target.close()
        break
    }
  },
)

export function installCloseConfirmation(window: BrowserWindow): void {
  let confirmationOpen = false

  window.on('close', event => {
    event.preventDefault()
    if (confirmationOpen) return
    confirmationOpen = true

    void dialog
      .showMessageBox(window, {
        type: 'question',
        title: 'Close Qingshu',
        message: 'Are you sure you want to close Qingshu?',
        buttons: ['Cancel', 'Close'],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1 && !window.isDestroyed()) {
          window.destroy()
        }
      })
      .finally(() => {
        confirmationOpen = false
      })
  })
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  installCloseConfirmation(win)

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(createWindow)

  app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('activate', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      windows[0].focus()
    } else {
      void createWindow()
    }
  })
}
