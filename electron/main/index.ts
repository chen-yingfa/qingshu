import {
  chmod,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { release } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
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
interface FileRevision {
  dev: number
  ino: number
  mode: number
  mtimeMs: number
  size: number
}
interface AuthorizedDocument {
  revision: FileRevision | null
  initialized: boolean
  saveQueue: Promise<void>
}
interface ExportedFile {
  realPath: string
  revision: FileRevision
}
const authorizedDocuments = new WeakMap<
  Electron.WebContents,
  Map<string, AuthorizedDocument>
>()
const exportedFiles = new WeakMap<
  Electron.WebContents,
  Map<string, ExportedFile>
>()
const RECENT_FILES_LIMIT = 12
let recentFiles: string[] | null = null
let recentFilesLoad: Promise<void> | null = null
let removedRecentFiles: string[] = []
let recentFilesWrite = Promise.resolve()
let recentFilesWarnings: string[] = []
let tempSequence = 0
const RECENT_WARNING_LIMIT = 10

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

function recentFilesPath(): string {
  return join(app.getPath('userData'), 'recent-files.json')
}

export function enqueueRecentWarning(
  warnings: string[],
  warning: string,
): string[] {
  if (warnings.includes(warning)) return warnings
  return [...warnings, warning].slice(-RECENT_WARNING_LIMIT)
}

function noteRecentWarning(error: unknown): void {
  recentFilesWarnings = enqueueRecentWarning(
    recentFilesWarnings,
    `Recent files could not be updated: ${messageOf(error)}`,
  )
}

async function atomicWriteRecentFiles(content: string): Promise<void> {
  const target = recentFilesPath()
  const tempPath = join(
    dirname(target),
    `.${basename(target)}.qingshu-${process.pid}-${++tempSequence}.tmp`,
  )
  let handle: FileHandle | undefined
  let renamed = false
  try {
    handle = await open(tempPath, 'wx', 0o600)
    await handle.chmod(0o600)
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(tempPath, target)
    renamed = true
    await chmod(target, 0o600)
    const directoryWarning = await syncDirectory(dirname(target))
    if (directoryWarning) throw new Error(directoryWarning)
  } finally {
    await handle?.close().catch(() => undefined)
    if (!renamed) {
      await unlink(tempPath).catch((error: unknown) => {
        if (!isMissingFile(error)) throw error
      })
    }
  }
}

function persistRecentFiles(): Promise<void> {
  const content = JSON.stringify(recentFiles ?? [])
  const operation = recentFilesWrite
    .catch(() => undefined)
    .then(() => atomicWriteRecentFiles(content))
  recentFilesWrite = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

export function recentEntriesNeedCleanup(
  stored: unknown,
  valid: string[],
): boolean {
  return (
    !Array.isArray(stored) ||
    stored.length !== valid.length ||
    stored.some((value, index) => value !== valid[index])
  )
}

export async function loadRecentFiles(
  read: () => Promise<string> = () => readFile(recentFilesPath(), 'utf8'),
): Promise<
  | { known: false; error: unknown }
  | { known: true; stored: unknown; malformed: boolean }
> {
  let serialized: string
  try {
    serialized = await read()
  } catch (error) {
    return isMissingFile(error)
      ? { known: true, stored: [], malformed: false }
      : { known: false, error }
  }
  try {
    return { known: true, stored: JSON.parse(serialized), malformed: false }
  } catch (error) {
    if (!(error instanceof SyntaxError)) return { known: false, error }
    return { known: true, stored: [], malformed: true }
  }
}

async function ensureRecentFiles(): Promise<void> {
  if (recentFiles) return
  if (recentFilesLoad) return recentFilesLoad
  recentFilesLoad = (async () => {
    const loaded = await loadRecentFiles()
    if (!loaded.known) {
      noteRecentWarning(loaded.error)
      return
    }
    const { stored, malformed } = loaded
    const candidates = Array.isArray(stored)
      ? stored.filter(
          (path): path is string =>
            typeof path === 'string' && path === resolve(path),
        )
      : []
    const valid: string[] = []
    const removed: string[] = []
    for (const path of candidates.slice(0, RECENT_FILES_LIMIT)) {
      try {
        const canonical = await realpath(path)
        if (canonical === path && !valid.includes(path)) valid.push(path)
        else removed.push(path)
      } catch (error) {
        if (isMissingFile(error)) removed.push(path)
        else {
          noteRecentWarning(error)
          if (!valid.includes(path)) valid.push(path)
        }
      }
    }
    recentFiles = valid
    removedRecentFiles = removed
    if (malformed || recentEntriesNeedCleanup(stored, valid)) {
      await persistRecentFiles().catch(noteRecentWarning)
    }
  })()
  try {
    await recentFilesLoad
  } finally {
    recentFilesLoad = null
  }
}

async function rememberRecent(path: string): Promise<void> {
  await ensureRecentFiles()
  if (recentFiles === null) {
    throw new Error('Recent files are temporarily unavailable; retrying later.')
  }
  recentFiles = [
    path,
    ...(recentFiles ?? []).filter((candidate) => candidate !== path),
  ].slice(0, RECENT_FILES_LIMIT)
  await persistRecentFiles()
}

async function safelyRememberRecent(path: string): Promise<void> {
  try {
    await rememberRecent(path)
  } catch (error) {
    noteRecentWarning(error)
  }
}

async function removeRecent(path: string): Promise<void> {
  await ensureRecentFiles()
  recentFiles = (recentFiles ?? []).filter((candidate) => candidate !== path)
  removedRecentFiles = [...removedRecentFiles, path]
  await persistRecentFiles().catch(noteRecentWarning)
}

async function rememberExport(
  sender: Electron.WebContents,
  path: string,
): Promise<void> {
  const requestedPath = resolve(path)
  const realPath = await realpath(requestedPath)
  const revision = await currentRevision(realPath)
  if (!revision) throw new Error('Exported file could not be verified')
  const files = exportedFiles.get(sender) ?? new Map<string, ExportedFile>()
  files.set(requestedPath, { realPath, revision })
  exportedFiles.set(sender, files)
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
  return {
    content: value.content,
    path: value.path as string | undefined,
  }
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

function revisionOf(value: Stats): FileRevision {
  return {
    dev: Number(value.dev),
    ino: Number(value.ino),
    mode: Number(value.mode),
    mtimeMs: value.mtimeMs,
    size: value.size,
  }
}

function sameRevision(left: FileRevision, right: FileRevision): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    (left.mode & 0o777) === (right.mode & 0o777) &&
    left.mtimeMs === right.mtimeMs &&
    left.size === right.size
  )
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

async function currentRevision(path: string): Promise<FileRevision | null> {
  try {
    return revisionOf(await stat(path))
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

async function canonicalDocumentPath(path: string): Promise<string> {
  const absolutePath = resolve(path)
  try {
    return await realpath(absolutePath)
  } catch (error) {
    if (!isMissingFile(error)) throw error
    const physicalParent = await realpath(dirname(absolutePath))
    return join(physicalParent, basename(absolutePath))
  }
}

function documentsFor(sender: Electron.WebContents): Map<string, AuthorizedDocument> {
  let documents = authorizedDocuments.get(sender)
  if (!documents) {
    documents = new Map()
    authorizedDocuments.set(sender, documents)
  }
  return documents
}

function authorizeDocument(
  documents: Map<string, AuthorizedDocument>,
  path: string,
  revision: FileRevision | null,
): AuthorizedDocument {
  const existing = documents.get(path)
  if (existing) {
    existing.revision = revision
    existing.initialized = true
    return existing
  }
  const authorized = {
    revision,
    initialized: true,
    saveQueue: Promise.resolve(),
  }
  documents.set(path, authorized)
  return authorized
}

function installDocumentQueue(
  documents: Map<string, AuthorizedDocument>,
  path: string,
): AuthorizedDocument {
  const existing = documents.get(path)
  if (existing) return existing
  const document = {
    revision: null,
    initialized: false,
    saveQueue: Promise.resolve(),
  }
  documents.set(path, document)
  return document
}

async function assertUnchanged(
  path: string,
  expected: FileRevision | null,
): Promise<void> {
  const actual = await currentRevision(path)
  if (
    (expected === null && actual !== null) ||
    (expected !== null && (actual === null || !sameRevision(expected, actual)))
  ) {
    throw new Error(
      'File changed on disk since it was opened or saved. Reopen it or use Save As.',
    )
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function directorySyncWarning(
  error: unknown,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined
  if (
    typeof code === 'string' &&
    (
      ['EINVAL', 'ENOTSUP'].includes(code) ||
      (platform === 'win32' && ['EPERM', 'EACCES'].includes(code))
    )
  ) {
    return undefined
  }
  return `Saved, but directory sync failed: ${messageOf(error)}`
}

async function syncDirectory(path: string): Promise<string | undefined> {
  let handle: FileHandle | undefined
  let warning: string | undefined
  try {
    handle = await open(path, 'r')
    await handle.sync()
  } catch (error) {
    warning = directorySyncWarning(error)
  }
  if (handle) {
    try {
      await handle.close()
    } catch (error) {
      warning ??= directorySyncWarning(error)
    }
  }
  return warning
}

async function atomicWrite(
  path: string,
  content: string | Buffer,
  expected: FileRevision | null,
): Promise<{ revision: FileRevision; warning?: string }> {
  const tempPath = join(
    dirname(path),
    `.${basename(path)}.qingshu-${process.pid}-${++tempSequence}.tmp`,
  )
  let handle: FileHandle | undefined
  let renamed = false
  let revision: FileRevision | undefined
  try {
    const mode = expected?.mode ? expected.mode & 0o777 : 0o600
    handle = await open(tempPath, 'wx', mode)
    await handle.chmod(mode)
    if (typeof content === 'string') await handle.writeFile(content, 'utf8')
    else await handle.writeFile(content)
    await handle.sync()
    revision = revisionOf(await handle.stat())
    await handle.close()
    handle = undefined
    await assertUnchanged(path, expected)
    await rename(tempPath, path)
    renamed = true
    const warning = await syncDirectory(dirname(path))
    return { revision, ...(warning ? { warning } : {}) }
  } finally {
    if (handle) {
      await handle.close().catch(() => undefined)
    }
    if (!renamed) {
      await unlink(tempPath).catch((error: unknown) => {
        if (!isMissingFile(error)) throw error
      })
    }
  }
}

async function readStableDocument(
  path: string,
): Promise<{ content: string; revision: FileRevision }> {
  const handle = await open(path, 'r')
  try {
    const before = revisionOf(await handle.stat())
    const content = await handle.readFile('utf8')
    const after = revisionOf(await handle.stat())
    if (!sameRevision(before, after)) {
      throw new Error('File changed while it was being opened. Please open it again.')
    }
    return { content, revision: after }
  } finally {
    await handle.close()
  }
}

function enqueueSave<T>(
  document: AuthorizedDocument,
  operation: () => Promise<T>,
): Promise<T> {
  const result = document.saveQueue.then(operation)
  document.saveQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function openAuthorizedDocument(
  documents: Map<string, AuthorizedDocument>,
  path: string,
): Promise<{ content: string; revision: FileRevision }> {
  const document = installDocumentQueue(documents, path)
  return enqueueSave(document, async () => {
    const opened = await readStableDocument(path)
    document.revision = opened.revision
    document.initialized = true
    return opened
  })
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
  const documentPath = await canonicalDocumentPath(path)
  const { content } = await openAuthorizedDocument(
    documentsFor(event.sender),
    documentPath,
  )
  await safelyRememberRecent(documentPath)

  return {
    canceled: false,
    path: documentPath,
    content,
  }
})

ipcMain.handle(
  'qingshu:list-recent-files',
  async (event, ...args: unknown[]): Promise<{
    paths: string[]
    removed: string[]
    warnings?: string[]
  }> => {
    assertTrustedIpcSender(event)
    assertNoPayload('qingshu:list-recent-files', args)
    await ensureRecentFiles()
    const removed = removedRecentFiles
    removedRecentFiles = []
    const warnings = recentFilesWarnings
    recentFilesWarnings = []
    return {
      paths: [...(recentFiles ?? [])],
      removed,
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  },
)

ipcMain.handle(
  'qingshu:open-recent-file',
  async (
    event: IpcMainInvokeEvent,
    rawPath: unknown,
    ...extra: unknown[]
  ): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    if (extra.length !== 0 || typeof rawPath !== 'string') {
      invalidPayload('qingshu:open-recent-file')
    }
    const path = rawPath as string
    await ensureRecentFiles()
    if (!(recentFiles ?? []).includes(path)) {
      throw new Error('Recent file is not authorized')
    }
    let canonical: string
    try {
      canonical = await realpath(path)
    } catch (error) {
      if (!isMissingFile(error)) throw error
      await removeRecent(path)
      throw new Error('Recent file no longer exists and was removed')
    }
    if (canonical !== path) {
      await removeRecent(path)
      throw new Error('Recent file changed and was removed')
    }
    let opened: Awaited<ReturnType<typeof readStableDocument>>
    try {
      opened = await openAuthorizedDocument(documentsFor(event.sender), path)
    } catch (error) {
      if (!isMissingFile(error)) throw error
      await removeRecent(path)
      throw new Error('Recent file no longer exists and was removed')
    }
    const { content } = opened
    await safelyRememberRecent(path)
    return { canceled: false, path, content }
  },
)

ipcMain.handle(
  'qingshu:choose-save-path',
  async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    assertNoPayload('qingshu:choose-save-path', args)
    const target = await selectSavePath(undefined, {
      title: 'Save Markdown',
      defaultPath: 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (target.canceled) return target
    const targetPath = await canonicalDocumentPath(target.path)
    const documents = documentsFor(event.sender)
    if (!documents.has(targetPath)) {
      authorizeDocument(
        documents,
        targetPath,
        await currentRevision(targetPath),
      )
    }
    return { canceled: false, path: targetPath }
  },
)

ipcMain.handle(
  'qingshu:save-file',
  async (
    event: IpcMainInvokeEvent,
    rawRequest: unknown,
    ...extra: unknown[]
  ): Promise<FileResult> => {
    assertTrustedIpcSender(event)
    const request = parseSaveRequest(rawRequest, extra)
    const documents = documentsFor(event.sender)
    const requestedPath = request.path
      ? await canonicalDocumentPath(request.path)
      : undefined
    let document = requestedPath ? documents.get(requestedPath) : undefined
    if (requestedPath && (!document || !document.initialized)) {
      throw new Error('Save path was not authorized by a file dialog')
    }
    const target = await selectSavePath(requestedPath, {
      title: 'Save Markdown',
      defaultPath: 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (target.canceled) return target
    const targetPath = requestedPath ?? await canonicalDocumentPath(target.path)
    if (!requestedPath) {
      document = installDocumentQueue(documents, targetPath)
    }
    if (!document) throw new Error('Save path authorization was lost')

    return enqueueSave(document, async () => {
      if (!document.initialized) {
        document.revision = await currentRevision(targetPath)
        document.initialized = true
      }
      await assertUnchanged(targetPath, document.revision)
      const committed = await atomicWrite(
        targetPath,
        request.content,
        document.revision,
      )
      document.revision = committed.revision
      await safelyRememberRecent(targetPath)
      return {
        canceled: false,
        path: targetPath,
        ...(committed.warning ? { warning: committed.warning } : {}),
      }
    })
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
    await rememberExport(event.sender, target.path)
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
    await rememberExport(event.sender, target.path)
    return target
  },
)

ipcMain.handle(
  'qingshu:show-item-in-folder',
  async (
    event: IpcMainInvokeEvent,
    rawPath: unknown,
    ...extra: unknown[]
  ): Promise<void> => {
    assertTrustedIpcSender(event)
    if (extra.length !== 0 || typeof rawPath !== 'string') {
      invalidPayload('qingshu:show-item-in-folder')
    }
    const path = rawPath as string
    const files = exportedFiles.get(event.sender)
    const exported = files?.get(path)
    if (path !== resolve(path) || !exported) {
      throw new Error('File was not exported by Qingshu')
    }
    // Consume before asynchronous validation so concurrent reveal calls cannot
    // reuse the same one-time grant.
    files?.delete(path)
    let realPath: string
    let revision: FileRevision | null
    try {
      realPath = await realpath(path)
      revision = await currentRevision(realPath)
    } catch {
      throw new Error('Exported file has changed or no longer exists')
    }
    if (
      realPath !== exported.realPath ||
      !revision ||
      !sameRevision(revision, exported.revision)
    ) {
      throw new Error('Exported file has changed or no longer exists')
    }
    shell.showItemInFolder(realPath)
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
  window.webContents.on(
    'did-start-navigation',
    (_event, _url, _isInPlace, isMainFrame) => {
      if (isMainFrame !== false) exportedFiles.delete(window.webContents)
    },
  )
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

export function disableApplicationMenu(): void {
  Menu.setApplicationMenu(null)
}

if (release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(() => {
    disableApplicationMenu()
    return createWindow()
  })

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
