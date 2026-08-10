import { readFile, writeFile } from 'node:fs/promises'
import { release } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  FileResult,
  WindowAction,
} from '../../src/types/electron'

const preload = join(__dirname, '../preload/index.js')
const indexHtml = join(__dirname, '../../dist/index.html')
const rendererUrl = process.env.VITE_DEV_SERVER_URL
  ? new URL(process.env.VITE_DEV_SERVER_URL)
  : pathToFileURL(indexHtml)

let win: BrowserWindow | null = null
interface CloseState {
  intentPending: boolean
  allowNextClose: boolean
  quitRequested: boolean
  quitConfirmed: boolean
}
const closeStates = new Map<BrowserWindow, CloseState>()
let allowAppQuit = false

function requestCloseIntent(window: BrowserWindow, state: CloseState): void {
  if (state.intentPending || window.isDestroyed()) return
  state.intentPending = true
  window.webContents.send('qingshu:close-intent')
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const candidate = new URL(rawUrl)
    if (rendererUrl.protocol === 'file:') {
      return (
        candidate.protocol === 'file:' &&
        candidate.host === rendererUrl.host &&
        candidate.pathname === rendererUrl.pathname
      )
    }
    return candidate.origin === rendererUrl.origin
  } catch {
    return false
  }
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  if (
    !frame ||
    frame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(frame.url)
  ) {
    throw new Error('Untrusted IPC sender')
  }
}

function invalidPayload(channel: string): never {
  throw new TypeError(`Invalid ${channel} payload`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function assertNoPayload(channel: string, args: unknown[]): void {
  if (args.length !== 0) invalidPayload(channel)
}

function parseSaveRequest(value: unknown, extra: unknown[]): {
  path?: string
  content: string
} {
  if (
    extra.length !== 0 ||
    !isRecord(value) ||
    !hasOnlyKeys(value, ['path', 'content']) ||
    typeof value.content !== 'string' ||
    (value.path !== undefined && typeof value.path !== 'string')
  ) {
    invalidPayload('qingshu:save-file')
  }
  return { content: value.content, path: value.path as string | undefined }
}

function parseHtmlRequest(value: unknown, extra: unknown[]): ExportHtmlRequest {
  if (
    extra.length !== 0 ||
    !isRecord(value) ||
    !hasOnlyKeys(value, ['html']) ||
    typeof value.html !== 'string'
  ) {
    invalidPayload('qingshu:export-html')
  }
  return { html: value.html }
}

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

ipcMain.handle('qingshu:open-file', async (event, ...args: unknown[]): Promise<FileResult> => {
  assertTrustedIpcSender(event)
  assertNoPayload('qingshu:open-file', args)
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
    event: IpcMainInvokeEvent,
    rawRequest: unknown,
    ...extra: unknown[]
  ): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    const request = parseSaveRequest(rawRequest, extra)
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
  async (
    event: IpcMainInvokeEvent,
    rawRequest: unknown,
    ...extra: unknown[]
  ): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    const request = parseHtmlRequest(rawRequest, extra)
    const target = await selectSavePath(undefined, {
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
  async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    assertNoPayload('qingshu:export-pdf', args)
    const target = await selectSavePath(undefined, {
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
  (
    event: IpcMainInvokeEvent,
    rawAction: unknown,
    ...extra: unknown[]
  ): void => {
    assertTrustedIpcSender(event)
    if (
      extra.length !== 0 ||
      typeof rawAction !== 'string' ||
      !['minimize', 'toggle-maximize', 'close'].includes(rawAction)
    ) {
      invalidPayload('qingshu:window-action')
    }
    const action = rawAction as WindowAction
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

ipcMain.handle(
  'qingshu:close-response',
  (
    event: IpcMainInvokeEvent,
    rawConfirmed: unknown,
    ...extra: unknown[]
  ): void => {
    assertTrustedIpcSender(event)
    if (extra.length !== 0 || typeof rawConfirmed !== 'boolean') {
      invalidPayload('qingshu:close-response')
    }
    const confirmed = rawConfirmed
    const target = BrowserWindow.fromWebContents(event.sender)
    if (!target) return
    const state = closeStates.get(target)
    if (!state?.intentPending) return

    state.intentPending = false
    if (confirmed !== true) {
      if (state.quitRequested) {
        for (const candidate of closeStates.values()) {
          candidate.intentPending = false
          candidate.quitRequested = false
          candidate.quitConfirmed = false
        }
      }
      return
    }

    if (state.quitRequested) {
      state.quitConfirmed = true
      const quitting = [...closeStates.entries()].filter(
        ([window, candidate]) => candidate.quitRequested && !window.isDestroyed(),
      )
      if (quitting.length > 0 && quitting.every(([, candidate]) => candidate.quitConfirmed)) {
        allowAppQuit = true
        for (const [, candidate] of quitting) candidate.allowNextClose = true
        app.quit()
      }
    } else if (!target.isDestroyed()) {
      state.allowNextClose = true
      target.close()
    }
  },
)

function installNavigationGuards(window: BrowserWindow): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

export function installCloseHandshake(window: BrowserWindow): void {
  const state: CloseState = {
    intentPending: false,
    allowNextClose: false,
    quitRequested: false,
    quitConfirmed: false,
  }
  closeStates.set(window, state)

  window.on('close', event => {
    if (state.allowNextClose) {
      state.allowNextClose = false
      return
    }

    event.preventDefault()
    requestCloseIntent(window, state)
  })

  window.on('closed', () => {
    closeStates.delete(window)
  })
}

export async function createWindow(): Promise<void> {
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

  installCloseHandshake(win)
  installNavigationGuards(win)

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(indexHtml)
  }

}

if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(createWindow)

  app.on('before-quit', event => {
    if (allowAppQuit) return
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed())
    if (windows.length === 0) return

    event.preventDefault()
    for (const window of windows) {
      const state = closeStates.get(window)
      if (!state) continue
      state.quitRequested = true
      state.quitConfirmed = false
      requestCloseIntent(window, state)
    }
  })

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
