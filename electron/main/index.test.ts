import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
  open: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  tempHandle: {
    writeFile: vi.fn(),
    sync: vi.fn(),
    stat: vi.fn(),
    chmod: vi.fn(),
    close: vi.fn(),
  },
  sourceHandle: {
    readFile: vi.fn(),
    stat: vi.fn(),
    close: vi.fn(),
  },
  directoryHandle: {
    sync: vi.fn(),
    close: vi.fn(),
  },
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  fromWebContents: vi.fn(),
  browserWindows: [] as any[],
  browserWindowOptions: [] as any[],
  appListeners: new Map<string, (...args: any[]) => unknown>(),
  webContentsListeners: new Map<string, (...args: any[]) => unknown>(),
  windowOpenHandler: undefined as undefined | ((details: { url: string }) => unknown),
  guardsInstalledAtLoad: [] as boolean[][],
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  stat: mocks.stat,
  realpath: mocks.realpath,
  open: mocks.open,
  rename: mocks.rename,
  unlink: mocks.unlink,
}))

vi.mock('electron', () => ({
  app: {
    disableHardwareAcceleration: vi.fn(),
    getName: () => 'Qingshu',
    isPackaged: false,
    on: vi.fn((name: string, listener: (...args: any[]) => unknown) => {
      mocks.appListeners.set(name, listener)
    }),
    quit: vi.fn(),
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    whenReady: () => new Promise(() => undefined),
  },
  BrowserWindow: class {
    static fromWebContents = mocks.fromWebContents
    static getAllWindows = () => mocks.browserWindows

    webContents = {
      on: vi.fn((name: string, listener: (...args: any[]) => unknown) => {
        mocks.webContentsListeners.set(name, listener)
      }),
      printToPDF: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(
        (handler: (details: { url: string }) => unknown) => {
          mocks.windowOpenHandler = handler
        },
      ),
    }
    loadFile = vi.fn(async () => {
      mocks.guardsInstalledAtLoad.push([
        mocks.webContentsListeners.has('will-navigate'),
        Boolean(mocks.windowOpenHandler),
      ])
    })
    loadURL = this.loadFile
    close = vi.fn()
    isDestroyed = vi.fn(() => false)
    on = vi.fn()

    constructor(options: any) {
      mocks.browserWindowOptions.push(options)
      mocks.browserWindows.push(this)
    }
  },
  dialog: {
    showMessageBox: mocks.showMessageBox,
    showOpenDialog: mocks.showOpenDialog,
    showSaveDialog: mocks.showSaveDialog,
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    },
  },
  shell: { openExternal: vi.fn() },
}))

const main = await import('./index')

const senderFrame = {
  url: 'file:///workspace/dist/index.html',
}

const event = {
  senderFrame,
  sender: {
    mainFrame: senderFrame,
    printToPDF: vi.fn(),
  },
}

describe('desktop IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stat.mockResolvedValue({
      dev: 1,
      ino: 2,
      mode: 0o100644,
      mtimeMs: 100,
      size: 6,
    })
    mocks.realpath.mockImplementation(async (path: string) => path)
    mocks.open.mockImplementation(async (path: string, flags: string) => {
      if (flags === 'wx') return mocks.tempHandle
      if (path.includes('.md')) return mocks.sourceHandle
      return mocks.directoryHandle
    })
    mocks.sourceHandle.readFile.mockResolvedValue('# Hello')
    mocks.sourceHandle.stat.mockResolvedValue({
      dev: 1,
      ino: 2,
      mode: 0o100644,
      mtimeMs: 100,
      size: 6,
    })
    mocks.sourceHandle.close.mockResolvedValue(undefined)
    mocks.tempHandle.writeFile.mockResolvedValue(undefined)
    mocks.tempHandle.sync.mockResolvedValue(undefined)
    mocks.tempHandle.stat.mockResolvedValue({
      dev: 1,
      ino: 8,
      mode: 0o100644,
      mtimeMs: 300,
      size: 5,
    })
    mocks.tempHandle.chmod.mockResolvedValue(undefined)
    mocks.tempHandle.close.mockResolvedValue(undefined)
    mocks.directoryHandle.sync.mockResolvedValue(undefined)
    mocks.directoryHandle.close.mockResolvedValue(undefined)
    mocks.rename.mockResolvedValue(undefined)
    mocks.unlink.mockResolvedValue(undefined)
  })

  it('registers only the renderer bridge channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      'qingshu:close-response',
      'qingshu:export-html',
      'qingshu:export-pdf',
      'qingshu:open-file',
      'qingshu:save-file',
      'qingshu:window-action',
    ])
  })

  it.each(['EINVAL', 'EPERM', 'EACCES', 'ENOTSUP'])(
    'suppresses Windows directory-sync %s as an unsupported operation',
    (code) => {
      const error = Object.assign(new Error(`unsupported ${code}`), { code })
      expect(main.directorySyncWarning(error, 'win32')).toBeUndefined()
    },
  )

  it('keeps unexpected Windows directory-sync failures as warnings', () => {
    const error = Object.assign(new Error('I/O failure'), { code: 'EIO' })
    expect(main.directorySyncWarning(error, 'win32')).toBe(
      'Saved, but directory sync failed: I/O failure',
    )
  })

  it('does not suppress unsupported-operation codes on other platforms', () => {
    const error = Object.assign(new Error('invalid operation'), { code: 'EINVAL' })
    expect(main.directorySyncWarning(error, 'linux')).toBe(
      'Saved, but directory sync failed: invalid operation',
    )
  })

  it('opens a selected Markdown file as UTF-8', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/notes/hello.md'] })
    mocks.sourceHandle.readFile.mockResolvedValue('# 你好')

    await expect(mocks.handlers.get('qingshu:open-file')?.(event)).resolves.toEqual({
      canceled: false,
      path: '/notes/hello.md',
      content: '# 你好',
    })
    expect(mocks.open).toHaveBeenCalledWith('/notes/hello.md', 'r')
    expect(mocks.sourceHandle.readFile).toHaveBeenCalledWith('utf8')
    expect(mocks.sourceHandle.stat).toHaveBeenCalledTimes(2)
    expect(mocks.sourceHandle.close).toHaveBeenCalledOnce()
  })

  it('opens and authorizes a symlink selection by its physical target', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/links/note.md'],
    })
    mocks.realpath.mockResolvedValueOnce('/real/note.md')

    await expect(mocks.handlers.get('qingshu:open-file')?.(event)).resolves.toEqual({
      canceled: false,
      path: '/real/note.md',
      content: '# Hello',
    })
    expect(mocks.open).toHaveBeenCalledWith('/real/note.md', 'r')
  })

  it('rejects content that changes while the opened handle is being read', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/unstable.md'],
    })
    mocks.sourceHandle.stat
      .mockResolvedValueOnce({
        dev: 1,
        ino: 7,
        mode: 0o100640,
        mtimeMs: 100,
        size: 5,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 7,
        mode: 0o100640,
        mtimeMs: 200,
        size: 9,
      })

    await expect(
      mocks.handlers.get('qingshu:open-file')?.(event),
    ).rejects.toThrow('File changed while it was being opened')
    expect(mocks.sourceHandle.close).toHaveBeenCalledOnce()
  })

  it('returns a structured cancellation when opening is dismissed', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await expect(mocks.handlers.get('qingshu:open-file')?.(event)).resolves.toEqual({
      canceled: true,
    })
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('rejects bridge calls from an unexpected sender URL', async () => {
    const untrustedEvent = {
      ...event,
      senderFrame: { url: 'https://evil.example/editor' },
    }

    await expect(
      mocks.handlers.get('qingshu:open-file')?.(untrustedEvent),
    ).rejects.toThrow('Untrusted IPC sender')
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('writes Markdown to an existing path without showing a dialog', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/notes/hello.md'] })
    await mocks.handlers.get('qingshu:open-file')?.(event)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/hello.md',
        content: '# Updated',
      }),
    ).resolves.toEqual({ canceled: false, path: '/notes/hello.md' })

    expect(mocks.showSaveDialog).not.toHaveBeenCalled()
    expect(mocks.tempHandle.writeFile).toHaveBeenCalledWith('# Updated', 'utf8')
    expect(mocks.tempHandle.sync).toHaveBeenCalledOnce()
    expect(mocks.tempHandle.chmod).toHaveBeenCalledWith(0o644)
    expect(mocks.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/notes\/\.hello\.md\.qingshu-\d+-\d+\.tmp$/),
      '/notes/hello.md',
    )
    expect(mocks.directoryHandle.sync).toHaveBeenCalledOnce()
    expect(mocks.directoryHandle.close).toHaveBeenCalledOnce()
  })

  it('serializes overlapping saves so the newest invocation remains on disk', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/ordered.md'],
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)
    mocks.stat
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100644,
        mtimeMs: 100,
        size: 6,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100644,
        mtimeMs: 100,
        size: 6,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100644,
        mtimeMs: 300,
        size: 5,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100644,
        mtimeMs: 300,
        size: 5,
      })
    let releaseFirst!: () => void
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const writes: string[] = []
    mocks.tempHandle.writeFile.mockImplementation(async (content: string) => {
      writes.push(content)
      if (writes.length === 1) await firstWrite
    })

    const older = mocks.handlers.get('qingshu:save-file')?.(event, {
      path: '/notes/ordered.md',
      content: 'older',
    }) as Promise<unknown>
    const newer = mocks.handlers.get('qingshu:save-file')?.(event, {
      path: '/notes/ordered.md',
      content: 'newest',
    }) as Promise<unknown>

    await vi.waitFor(() => expect(writes).toEqual(['older']))
    expect(mocks.rename).not.toHaveBeenCalled()
    releaseFirst()
    await expect(Promise.all([older, newer])).resolves.toEqual([
      { canceled: false, path: '/notes/ordered.md' },
      { canceled: false, path: '/notes/ordered.md' },
    ])
    expect(writes).toEqual(['older', 'newest'])
    expect(mocks.rename).toHaveBeenCalledTimes(2)
  })

  it('rejects a renderer path that no dialog previously authorized', async () => {
    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/forged.md',
        content: '# Forged',
      }),
    ).rejects.toThrow('Save path was not authorized by a file dialog')

    expect(
      mocks.open.mock.calls.filter(([, flags]) => flags === 'wx'),
    ).toHaveLength(0)
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('rejects overwrite when the opened file changed externally', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/notes/conflict.md'] })
    mocks.sourceHandle.readFile.mockResolvedValue('# First')
    mocks.sourceHandle.stat.mockResolvedValue({
      dev: 1,
      ino: 4,
      mode: 0o100644,
      mtimeMs: 100,
      size: 7,
    })
    mocks.stat.mockResolvedValue({
      dev: 1,
      ino: 4,
      mode: 0o100644,
      mtimeMs: 200,
      size: 12,
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/conflict.md',
        content: '# Mine',
      }),
    ).rejects.toThrow('File changed on disk')

    expect(
      mocks.open.mock.calls.filter(([, flags]) => flags === 'wx'),
    ).toHaveLength(0)
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('rechecks the target after temp fsync and aborts if an external edit interleaves', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/interleaved.md'],
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)
    mocks.stat
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100644,
        mtimeMs: 100,
        size: 6,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100644,
        mtimeMs: 200,
        size: 14,
      })

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/interleaved.md',
        content: '# Mine',
      }),
    ).rejects.toThrow('File changed on disk')

    expect(mocks.tempHandle.sync).toHaveBeenCalledOnce()
    expect(mocks.rename).not.toHaveBeenCalled()
    expect(mocks.unlink).toHaveBeenCalledOnce()
  })

  it('treats a chmod between verification and rename as a conflict', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/mode.md'],
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)
    mocks.stat
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100644,
        mtimeMs: 100,
        size: 6,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 2,
        mode: 0o100600,
        mtimeMs: 100,
        size: 6,
      })

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/mode.md',
        content: '# Mine',
      }),
    ).rejects.toThrow('File changed on disk')
    expect(mocks.tempHandle.chmod).toHaveBeenCalledWith(0o644)
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('unifies concurrent Save As aliases under one physical-path queue', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.showSaveDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePath: '/links-a/shared-save-as.md',
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePath: '/links-b/shared-save-as.md',
      })
    mocks.realpath
      .mockResolvedValueOnce('/real/shared-save-as.md')
      .mockResolvedValueOnce('/real/shared-save-as.md')
    let releaseInitialStat!: () => void
    const initialStat = new Promise<void>((resolve) => {
      releaseInitialStat = resolve
    })
    let statCall = 0
    const committed = {
      dev: 1,
      ino: 8,
      mode: 0o100600,
      mtimeMs: 300,
      size: 5,
    }
    mocks.stat.mockImplementation(async () => {
      statCall += 1
      if (statCall === 1) await initialStat
      if (statCall <= 3) throw missing
      return committed
    })
    mocks.tempHandle.stat.mockResolvedValue(committed)
    const writes: string[] = []
    mocks.tempHandle.writeFile.mockImplementation(async (content: string) => {
      writes.push(content)
    })

    const first = mocks.handlers.get('qingshu:save-file')?.(event, {
      content: 'first',
    }) as Promise<unknown>
    const second = mocks.handlers.get('qingshu:save-file')?.(event, {
      content: 'second',
    }) as Promise<unknown>
    await vi.waitFor(() => expect(mocks.stat).toHaveBeenCalledTimes(1))
    expect(writes).toEqual([])

    releaseInitialStat()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { canceled: false, path: '/real/shared-save-as.md' },
      { canceled: false, path: '/real/shared-save-as.md' },
    ])
    expect(writes).toEqual(['first', 'second'])
  })

  it('saves an existing symlink selection through its physical target', async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/links/note.md',
    })
    mocks.realpath.mockResolvedValueOnce('/real/note.md')

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# Updated' }),
    ).resolves.toEqual({ canceled: false, path: '/real/note.md' })

    expect(mocks.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/real\/\.note\.md\.qingshu-\d+-\d+\.tmp$/),
      '/real/note.md',
    )
    expect(mocks.rename).not.toHaveBeenCalledWith(expect.anything(), '/links/note.md')
  })

  it('canonicalizes the existing parent of a new Save As path', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/alias/new.md',
    })
    mocks.realpath
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce('/real-parent')
    mocks.stat.mockRejectedValue(missing)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# New' }),
    ).resolves.toEqual({ canceled: false, path: '/real-parent/new.md' })
    expect(mocks.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/real-parent\/\.new\.md\.qingshu-\d+-\d+\.tmp$/),
      '/real-parent/new.md',
    )
  })

  it('authorizes Save As, writes exclusively, and records the new revision', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/notes/new.md',
    })
    mocks.stat
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100600,
        mtimeMs: 300,
        size: 5,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100600,
        mtimeMs: 300,
        size: 5,
      })
    mocks.tempHandle.stat
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100600,
        mtimeMs: 300,
        size: 5,
      })
      .mockResolvedValueOnce({
        dev: 1,
        ino: 8,
        mode: 0o100600,
        mtimeMs: 400,
        size: 6,
      })

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# New' }),
    ).resolves.toEqual({ canceled: false, path: '/notes/new.md' })

    expect(mocks.open).toHaveBeenCalledWith(
      expect.stringMatching(/^\/notes\/\.new\.md\.qingshu-\d+-\d+\.tmp$/),
      'wx',
      0o600,
    )
    expect(mocks.rename).toHaveBeenCalledOnce()

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/new.md',
        content: '# Next',
      }),
    ).resolves.toMatchObject({ canceled: false, path: '/notes/new.md' })
    expect(mocks.showSaveDialog).toHaveBeenCalledOnce()
  })

  it('returns a warning when Windows cannot fsync an opened directory', async () => {
    const windowsDirectoryError = Object.assign(new Error('directory sync unsupported'), {
      code: 'EINVAL',
    })
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/notes/windows.md',
    })
    mocks.stat.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    )
    mocks.directoryHandle.sync.mockRejectedValue(windowsDirectoryError)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# Windows' }),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/windows.md',
      warning: 'Saved, but directory sync failed: directory sync unsupported',
    })
    expect(mocks.directoryHandle.close).toHaveBeenCalledOnce()
  })

  it('keeps the committed revision after directory sync failure for the next save', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const syncFailure = Object.assign(new Error('I/O failure'), { code: 'EIO' })
    const committed = {
      dev: 1,
      ino: 8,
      mode: 0o100600,
      mtimeMs: 300,
      size: 5,
    }
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/notes/durable-warning.md',
    })
    mocks.stat
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(committed)
      .mockResolvedValueOnce(committed)
    mocks.tempHandle.stat.mockResolvedValue(committed)
    mocks.directoryHandle.sync
      .mockRejectedValueOnce(syncFailure)
      .mockResolvedValueOnce(undefined)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: 'first' }),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/durable-warning.md',
      warning: 'Saved, but directory sync failed: I/O failure',
    })
    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/durable-warning.md',
        content: 'second',
      }),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/durable-warning.md',
    })
    expect(mocks.rename).toHaveBeenCalledTimes(2)
  })

  it('closes and removes an adjacent temp file after an atomic-save failure', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/notes/failure.md',
    })
    mocks.stat.mockRejectedValue(missing)
    mocks.tempHandle.writeFile.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# Fail' }),
    ).rejects.toThrow('disk full')

    const tempPath = mocks.open.mock.calls[0][0]
    expect(mocks.tempHandle.close).toHaveBeenCalledOnce()
    expect(mocks.unlink).toHaveBeenCalledWith(tempPath)
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('does not write when the save dialog is canceled', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# Unsaved' }),
    ).resolves.toEqual({ canceled: true })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('exports HTML through a save dialog', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/exports/hello.html' })

    await expect(
      mocks.handlers.get('qingshu:export-html')?.(event, { html: '<h1>Hello</h1>' }),
    ).resolves.toEqual({ canceled: false, path: '/exports/hello.html' })
    expect(mocks.writeFile).toHaveBeenCalledWith(
      '/exports/hello.html',
      '<h1>Hello</h1>',
      'utf8',
    )
  })

  it('rejects renderer-supplied export paths instead of bypassing native dialogs', async () => {
    await expect(
      mocks.handlers.get('qingshu:export-html')?.(event, {
        html: '<h1>Hello</h1>',
        path: '/exports/forced.html',
      }),
    ).rejects.toThrow('Invalid qingshu:export-html payload')
    await expect(
      mocks.handlers.get('qingshu:export-pdf')?.(event, {
        path: '/exports/forced.pdf',
      }),
    ).rejects.toThrow('Invalid qingshu:export-pdf payload')
    expect(mocks.showSaveDialog).not.toHaveBeenCalled()
  })

  it('does not write when HTML export is canceled', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(
      mocks.handlers.get('qingshu:export-html')?.(event, { html: '<h1>Unsaved</h1>' }),
    ).resolves.toEqual({ canceled: true })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('prints and writes a PDF through a save dialog', async () => {
    const pdf = Buffer.from('pdf')
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/exports/hello.pdf' })
    event.sender.printToPDF.mockResolvedValue(pdf)

    await expect(mocks.handlers.get('qingshu:export-pdf')?.(event)).resolves.toEqual({
      canceled: false,
      path: '/exports/hello.pdf',
    })
    expect(event.sender.printToPDF).toHaveBeenCalledWith({
      pageSize: 'A4',
      printBackground: true,
    })
    expect(mocks.writeFile).toHaveBeenCalledWith('/exports/hello.pdf', pdf)
  })

  it('does not print or write when PDF export is canceled', async () => {
    mocks.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(
      mocks.handlers.get('qingshu:export-pdf')?.(event),
    ).resolves.toEqual({ canceled: true })
    expect(event.sender.printToPDF).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('runtime-validates every renderer IPC payload', async () => {
    const invalidCalls: Array<[string, unknown]> = [
      ['qingshu:open-file', { unexpected: true }],
      ['qingshu:save-file', { content: 42 }],
      ['qingshu:export-html', { html: 42 }],
      ['qingshu:export-pdf', {}],
      ['qingshu:window-action', 'destroy'],
      ['qingshu:close-response', 'true'],
    ]

    for (const [channel, payload] of invalidCalls) {
      await expect(
        Promise.resolve().then(() => mocks.handlers.get(channel)?.(event, payload)),
      ).rejects.toThrow(`Invalid ${channel} payload`)
    }
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(mocks.showSaveDialog).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('dispatches supported platform window controls', async () => {
    const window = {
      close: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      minimize: vi.fn(),
      unmaximize: vi.fn(),
    }
    mocks.fromWebContents.mockReturnValue(window)
    const handler = mocks.handlers.get('qingshu:window-action')

    await handler?.(event, 'minimize')
    await handler?.(event, 'toggle-maximize')
    await handler?.(event, 'close')

    expect(window.minimize).toHaveBeenCalledOnce()
    expect(window.maximize).toHaveBeenCalledOnce()
    expect(window.close).toHaveBeenCalledOnce()
  })
})

describe('browser window security', () => {
  it('installs secure preferences and navigation guards before loading content', async () => {
    mocks.webContentsListeners.clear()
    mocks.windowOpenHandler = undefined

    await main.createWindow()

    expect(mocks.browserWindowOptions.at(-1).webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
    expect(mocks.guardsInstalledAtLoad.at(-1)).toEqual([true, true])

    const preventDefault = vi.fn()
    mocks.webContentsListeners.get('will-navigate')?.(
      { preventDefault },
      'https://evil.example/editor',
    )
    expect(preventDefault).toHaveBeenCalledOnce()
    const openHandler = mocks.windowOpenHandler as unknown as (details: {
      url: string
    }) => unknown
    expect(openHandler({ url: 'https://evil.example/popup' })).toEqual({
      action: 'deny',
    })
  })
})

describe('renderer close handshake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends close intent and only permits a confirmed follow-up close', async () => {
    let closeListener: ((event: { preventDefault: () => void }) => void) | undefined
    const window = {
      close: vi.fn(),
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
      on: vi.fn((name: string, listener: typeof closeListener) => {
        if (name === 'close') closeListener = listener
      }),
    }
    mocks.fromWebContents.mockReturnValue(window)

    main.installCloseHandshake(window as never)
    const intentEvent = { preventDefault: vi.fn() }
    closeListener?.(intentEvent)

    expect(intentEvent.preventDefault).toHaveBeenCalledOnce()
    expect(window.webContents.send).toHaveBeenCalledWith('qingshu:close-intent')
    expect(window.close).not.toHaveBeenCalled()

    await mocks.handlers.get('qingshu:close-response')?.(event, true)
    expect(window.close).toHaveBeenCalledOnce()

    const confirmedEvent = { preventDefault: vi.fn() }
    closeListener?.(confirmedEvent)
    expect(confirmedEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('clears close intent after rejection so a later native close asks again', async () => {
    let closeListener: ((event: { preventDefault: () => void }) => void) | undefined
    const window = {
      close: vi.fn(),
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
      on: vi.fn((name: string, listener: typeof closeListener) => {
        if (name === 'close') closeListener = listener
      }),
    }
    mocks.fromWebContents.mockReturnValue(window)

    main.installCloseHandshake(window as never)
    closeListener?.({ preventDefault: vi.fn() })
    await mocks.handlers.get('qingshu:close-response')?.(event, false)
    closeListener?.({ preventDefault: vi.fn() })

    expect(window.webContents.send).toHaveBeenCalledTimes(2)
    expect(window.close).not.toHaveBeenCalled()
  })

  it('restarts an application quit only after the renderer confirms', async () => {
    mocks.browserWindows.length = 0
    await main.createWindow()
    const window = mocks.browserWindows.at(-1)
    mocks.fromWebContents.mockReturnValue(window)
    const beforeQuit = mocks.appListeners.get('before-quit')
    const quitEvent = { preventDefault: vi.fn() }

    beforeQuit?.(quitEvent)

    expect(quitEvent.preventDefault).toHaveBeenCalledOnce()
    expect(window.webContents.send).toHaveBeenCalledWith('qingshu:close-intent')
    expect(vi.mocked((await import('electron')).app.quit)).not.toHaveBeenCalled()

    await mocks.handlers.get('qingshu:close-response')?.(event, true)
    expect(vi.mocked((await import('electron')).app.quit)).toHaveBeenCalledOnce()
  })
})
