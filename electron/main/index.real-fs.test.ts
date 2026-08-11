import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  openPath: '',
  savePath: '',
  userData: '',
}))

vi.mock('electron', () => ({
  app: {
    disableHardwareAcceleration: vi.fn(),
    getName: () => 'Qingshu',
    getPath: () => mocks.userData,
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    whenReady: () => new Promise(() => undefined),
  },
  BrowserWindow: class {
    static fromWebContents = vi.fn()
    static getAllWindows = () => []
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({
      canceled: false,
      filePaths: [mocks.openPath],
    })),
    showSaveDialog: vi.fn(async () => ({
      canceled: false,
      filePath: mocks.savePath,
    })),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    },
  },
  Menu: { setApplicationMenu: vi.fn() },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

await import('./index')

const senderFrame = { url: 'file:///workspace/dist/index.html' }
const event = {
  senderFrame,
  sender: {
    mainFrame: senderFrame,
    printToPDF: vi.fn(),
  },
}

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'qingshu-real-fs-'))
  mocks.userData = join(root, 'user-data')
  await mkdir(mocks.userData)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('Electron real filesystem commits', () => {
  it('conservatively rejects a replaced save target without overwriting it', async () => {
    const documentPath = join(root, 'conflict.md')
    const displacedPath = join(root, 'conflict.original.md')
    await writeFile(documentPath, '# Original', { mode: 0o600 })
    mocks.openPath = documentPath
    await mocks.handlers.get('qingshu:open-file')?.(event)

    await rename(documentPath, displacedPath)
    await writeFile(documentPath, '# External replacement', { mode: 0o600 })

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: documentPath,
        content: '# Renderer edit',
        saveToken: 'real-fs-conflict',
      }),
    ).rejects.toThrow('File changed on disk')
    await expect(readFile(documentPath, 'utf8')).resolves.toBe(
      '# External replacement',
    )
  })

  it('atomically exports private HTML and leaves no adjacent temp file', async () => {
    const exportPath = join(root, 'private.html')
    mocks.savePath = exportPath

    await expect(
      mocks.handlers
        .get('qingshu:export-html')
        ?.(event, { html: '<h1>Private</h1>' }),
    ).resolves.toEqual({ canceled: false, path: exportPath })

    expect(await readFile(exportPath, 'utf8')).toBe('<h1>Private</h1>')
    expect((await stat(exportPath)).mode & 0o777).toBe(0o600)
    expect(
      (await readdir(root)).some(name => name.includes('.qingshu-')),
    ).toBe(false)
  })

  it('cleans an export temp file when the selected target is not a file', async () => {
    const invalidTarget = join(root, 'directory.html')
    await mkdir(invalidTarget)
    await chmod(invalidTarget, 0o700)
    mocks.savePath = invalidTarget

    await expect(
      mocks.handlers
        .get('qingshu:export-html')
        ?.(event, { html: '<h1>Rejected</h1>' }),
    ).rejects.toThrow('File changed on disk')
    expect(
      (await readdir(root)).some(name => name.includes('.qingshu-')),
    ).toBe(false)
  })
})
