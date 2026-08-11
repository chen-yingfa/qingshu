import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  chmod: vi.fn(),
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
  recentHandle: {
    writeFile: vi.fn(),
    sync: vi.fn(),
    chmod: vi.fn(),
    close: vi.fn(),
  },
  recentDirectoryHandle: {
    sync: vi.fn(),
    close: vi.fn(),
  },
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  showItemInFolder: vi.fn(),
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
  chmod: mocks.chmod,
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
    getPath: () => '/user-data',
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
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: mocks.showItemInFolder,
  },
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

function documentRenameCalls() {
  return mocks.rename.mock.calls.filter(([, target]) =>
    String(target).endsWith('.md'),
  )
}

function documentExclusiveOpenCalls() {
  return mocks.open.mock.calls.filter(
    ([path, flags]) =>
      flags === 'wx' && !String(path).includes('.recent-files.json.qingshu-'),
  )
}

describe('desktop IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const mock of [
      mocks.readFile,
      mocks.writeFile,
      mocks.chmod,
      mocks.stat,
      mocks.realpath,
      mocks.open,
      mocks.rename,
      mocks.unlink,
      mocks.sourceHandle.readFile,
      mocks.sourceHandle.stat,
      mocks.sourceHandle.close,
      mocks.tempHandle.writeFile,
      mocks.tempHandle.sync,
      mocks.tempHandle.stat,
      mocks.tempHandle.chmod,
      mocks.tempHandle.close,
      mocks.directoryHandle.sync,
      mocks.directoryHandle.close,
      mocks.recentHandle.writeFile,
      mocks.recentHandle.sync,
      mocks.recentHandle.chmod,
      mocks.recentHandle.close,
      mocks.recentDirectoryHandle.sync,
      mocks.recentDirectoryHandle.close,
      mocks.showOpenDialog,
      mocks.showSaveDialog,
    ]) {
      mock.mockReset()
    }
    mocks.stat.mockResolvedValue({
      dev: 1,
      ino: 2,
      mode: 0o100644,
      mtimeMs: 100,
      size: 6,
    })
    mocks.realpath.mockImplementation(async (path: string) => path)
    mocks.open.mockImplementation(async (path: string, flags: string) => {
      if (path.includes('.recent-files.json.qingshu-')) {
        return mocks.recentHandle
      }
      if (path === '/user-data') return mocks.recentDirectoryHandle
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
    mocks.recentHandle.writeFile.mockResolvedValue(undefined)
    mocks.recentHandle.sync.mockResolvedValue(undefined)
    mocks.recentHandle.chmod.mockResolvedValue(undefined)
    mocks.recentHandle.close.mockResolvedValue(undefined)
    mocks.recentDirectoryHandle.sync.mockResolvedValue(undefined)
    mocks.recentDirectoryHandle.close.mockResolvedValue(undefined)
    mocks.chmod.mockResolvedValue(undefined)
    mocks.rename.mockResolvedValue(undefined)
    mocks.unlink.mockResolvedValue(undefined)
  })

  it('registers only the renderer bridge channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      'qingshu:choose-save-path',
      'qingshu:close-response',
      'qingshu:export-html',
      'qingshu:export-pdf',
      'qingshu:list-recent-files',
      'qingshu:open-file',
      'qingshu:open-recent-file',
      'qingshu:save-file',
      'qingshu:show-item-in-folder',
      'qingshu:window-action',
    ])
  })

  it('persists canonical recents, removes missing entries, and opens only stored paths', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.readFile.mockResolvedValue(
      JSON.stringify(['/notes/recent.md', '/notes/missing.md']),
    )
    mocks.realpath.mockImplementation(async (path: string) => {
      if (path === '/notes/missing.md') throw missing
      return path
    })

    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toEqual({
      paths: ['/notes/recent.md'],
      removed: ['/notes/missing.md'],
    })
    expect(mocks.recentHandle.writeFile).toHaveBeenCalledWith(
      JSON.stringify(['/notes/recent.md']),
      'utf8',
    )
    expect(mocks.recentHandle.sync).toHaveBeenCalledOnce()
    expect(mocks.recentHandle.chmod).toHaveBeenCalledWith(0o600)
    expect(mocks.chmod).toHaveBeenCalledWith(
      '/user-data/recent-files.json',
      0o600,
    )
    expect(mocks.rename).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/user-data\/\.recent-files\.json\.qingshu-\d+-\d+\.tmp$/,
      ),
      '/user-data/recent-files.json',
    )

    await expect(
      mocks.handlers
        .get('qingshu:open-recent-file')
        ?.(event, '/private/not-recent.md'),
    ).rejects.toThrow('Recent file is not authorized')
    await expect(
      mocks.handlers
        .get('qingshu:open-recent-file')
        ?.(event, '/notes/recent.md'),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/recent.md',
      content: '# Hello',
    })
    expect(mocks.open).toHaveBeenCalledWith('/notes/recent.md', 'r')
  })

  it('removes and reports a recent file that disappears when opened', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.realpath.mockRejectedValueOnce(missing)

    await expect(
      mocks.handlers
        .get('qingshu:open-recent-file')
        ?.(event, '/notes/recent.md'),
    ).rejects.toThrow('Recent file no longer exists and was removed')
    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toMatchObject({ paths: [] })
  })

  it('keeps open successful when recents cannot be read or persisted and recovers the write queue', async () => {
    const denied = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    })
    mocks.readFile.mockRejectedValue(denied)
    mocks.recentHandle.writeFile
      .mockRejectedValueOnce(new Error('recent write failed'))
      .mockResolvedValue(undefined)
    mocks.showOpenDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/notes/first.md'],
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/notes/second.md'],
      })

    await expect(
      mocks.handlers.get('qingshu:open-file')?.(event),
    ).resolves.toMatchObject({ canceled: false, path: '/notes/first.md' })
    await expect(
      mocks.handlers.get('qingshu:open-file')?.(event),
    ).resolves.toMatchObject({ canceled: false, path: '/notes/second.md' })
    expect(mocks.recentHandle.writeFile).toHaveBeenCalledTimes(2)
    expect(mocks.rename).toHaveBeenCalledOnce()
    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toMatchObject({
      paths: ['/notes/second.md', '/notes/first.md'],
      warnings: [
        expect.stringContaining('Recent files could not be updated'),
      ],
    })
  })

  it('deduplicates and bounds repeated recent-unavailable warnings', async () => {
    let warnings: string[] = []
    for (let index = 0; index < 20; index += 1) {
      warnings = main.enqueueRecentWarning(
        warnings,
        index < 12 ? `warning ${index}` : 'warning 11',
      )
    }

    expect(warnings).toEqual([
      'warning 2',
      'warning 3',
      'warning 4',
      'warning 5',
      'warning 6',
      'warning 7',
      'warning 8',
      'warning 9',
      'warning 10',
      'warning 11',
    ])
  })

  it('keeps a transient recent read failure unknown instead of treating it as empty', async () => {
    const denied = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    })
    const loaded = await main.loadRecentFiles(() => Promise.reject(denied))

    expect(loaded).toEqual({ known: false, error: denied })
  })

  it('rewrites malformed recent JSON once an empty state is known safe', async () => {
    const loaded = await main.loadRecentFiles(() =>
      Promise.resolve('{malformed'),
    )

    expect(loaded).toEqual({
      known: true,
      stored: [],
      malformed: true,
    })
  })

  it('retains a recent directory sync warning for the renderer', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.readFile.mockRejectedValue(missing)
    mocks.recentDirectoryHandle.sync.mockRejectedValue(
      Object.assign(new Error('directory sync failed'), { code: 'EIO' }),
    )
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/sync-warning.md'],
    })

    await expect(
      mocks.handlers.get('qingshu:open-file')?.(event),
    ).resolves.toMatchObject({
      canceled: false,
      path: '/notes/sync-warning.md',
    })
    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toMatchObject({
      warnings: [expect.stringContaining('directory sync failed')],
    })
  })

  it('queues each recent persistence warning until one list response consumes it', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    mocks.readFile.mockRejectedValue(missing)
    mocks.recentHandle.writeFile
      .mockRejectedValueOnce(new Error('first persistence failure'))
      .mockResolvedValue(undefined)
    mocks.recentHandle.chmod
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('second persistence failure'))
    mocks.showOpenDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/notes/first-warning.md'],
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/notes/second-warning.md'],
      })

    await mocks.handlers.get('qingshu:open-file')?.(event)
    await mocks.handlers.get('qingshu:open-file')?.(event)

    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toMatchObject({
      warnings: [
        expect.stringContaining('first persistence failure'),
        expect.stringContaining('second persistence failure'),
      ],
    })
    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.not.toHaveProperty('warnings')
  })

  it('keeps a committed save successful when recent chmod fails', async () => {
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/chmod-warning.md'],
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)
    mocks.recentHandle.chmod.mockRejectedValueOnce(
      new Error('recent chmod failed'),
    )

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/chmod-warning.md',
        content: '# Committed',
      }),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/chmod-warning.md',
    })
    expect(mocks.tempHandle.writeFile).toHaveBeenCalledWith(
      '# Committed',
      'utf8',
    )
  })

  it('removes a recent file that disappears after canonical validation', async () => {
    const path = '/notes/raced-away.md'
    const missing = Object.assign(new Error('missing parent'), {
      code: 'ENOTDIR',
    })
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] })
    await mocks.handlers.get('qingshu:open-file')?.(event)
    mocks.open.mockRejectedValueOnce(missing)

    await expect(
      mocks.handlers.get('qingshu:open-recent-file')?.(event, path),
    ).rejects.toThrow('Recent file no longer exists and was removed')
    await expect(
      mocks.handlers.get('qingshu:list-recent-files')?.(event),
    ).resolves.toMatchObject({ removed: [path] })
  })

  it.each(['EINVAL', 'EPERM', 'EACCES', 'ENOTSUP'])(
    'suppresses Windows directory-sync %s as an unsupported operation',
    (code) => {
      const error = Object.assign(new Error(`unsupported ${code}`), { code })
      expect(main.directorySyncWarning(error, 'win32')).toBeUndefined()
    },
  )

  it('detects invalid stored recent entries that filtering removed', () => {
    expect(
      main.recentEntriesNeedCleanup(
        ['/notes/recent.md', 42],
        ['/notes/recent.md'],
      ),
    ).toBe(true)
    expect(
      main.recentEntriesNeedCleanup(
        ['/notes/recent.md'],
        ['/notes/recent.md'],
      ),
    ).toBe(false)
  })

  it.each([
    ['linux', 'EINVAL'],
    ['linux', 'ENOTSUP'],
    ['darwin', 'EINVAL'],
    ['darwin', 'ENOTSUP'],
    ['win32', 'EINVAL'],
    ['win32', 'ENOTSUP'],
  ] as const)(
    'suppresses directory-sync %s/%s capability limitations',
    (platform, code) => {
      const error = Object.assign(new Error(`unsupported ${code}`), { code })
      expect(main.directorySyncWarning(error, platform)).toBeUndefined()
    },
  )

  it.each(['linux', 'darwin'] as const)(
    'retains permission errors as warnings on %s',
    (platform) => {
      for (const code of ['EPERM', 'EACCES']) {
        const error = Object.assign(new Error(`permission ${code}`), { code })
        expect(main.directorySyncWarning(error, platform)).toBe(
          `Saved, but directory sync failed: permission ${code}`,
        )
      }
    },
  )

  it.each(['linux', 'darwin', 'win32'] as const)(
    'keeps unexpected directory-sync failures as warnings on %s',
    (platform) => {
      const error = Object.assign(new Error('I/O failure'), { code: 'EIO' })
      expect(main.directorySyncWarning(error, platform)).toBe(
        'Saved, but directory sync failed: I/O failure',
      )
    },
  )

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
    expect(documentRenameCalls()).toHaveLength(0)
    releaseFirst()
    await expect(Promise.all([older, newer])).resolves.toEqual([
      { canceled: false, path: '/notes/ordered.md' },
      { canceled: false, path: '/notes/ordered.md' },
    ])
    expect(writes).toEqual(['older', 'newest'])
    expect(documentRenameCalls()).toHaveLength(2)
  })

  it('serializes duplicate Open between Save A and Save B on one authorization', async () => {
    const initialRevision = {
      dev: 1,
      ino: 2,
      mode: 0o100644,
      mtimeMs: 100,
      size: 7,
    }
    const savedRevision = {
      dev: 1,
      ino: 8,
      mode: 0o100644,
      mtimeMs: 300,
      size: 6,
    }
    let diskContent = 'initial'
    let pendingContent = ''
    let releaseSaveA!: () => void
    const saveABlocked = new Promise<void>((resolve) => {
      releaseSaveA = resolve
    })
    const order: string[] = []
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/notes/interleaved.md'],
    })
    mocks.sourceHandle.stat.mockResolvedValue(initialRevision)
    mocks.sourceHandle.readFile.mockImplementation(async () => {
      order.push(`read:${diskContent}`)
      return diskContent
    })
    await mocks.handlers.get('qingshu:open-file')?.(event)

    mocks.stat
      .mockResolvedValueOnce(initialRevision)
      .mockResolvedValueOnce(initialRevision)
      .mockResolvedValue(savedRevision)
    mocks.sourceHandle.stat.mockResolvedValue(savedRevision)
    mocks.tempHandle.stat.mockResolvedValue(savedRevision)
    mocks.tempHandle.writeFile.mockImplementation(async (content: string) => {
      pendingContent = content
      order.push(`write:${content}`)
      if (content === 'save-a') await saveABlocked
    })
    mocks.rename.mockImplementation(async (_source: string, target: string) => {
      if (target === '/notes/interleaved.md') {
        diskContent = pendingContent
        order.push(`rename:${diskContent}`)
      }
    })

    const saveA = mocks.handlers.get('qingshu:save-file')?.(event, {
      path: '/notes/interleaved.md',
      content: 'save-a',
    }) as Promise<unknown>
    await vi.waitFor(() => expect(order).toContain('write:save-a'))

    let duplicateSettled = false
    const duplicateOpen = (mocks.handlers.get('qingshu:open-file')?.(event) as Promise<unknown>)
      .finally(() => {
        duplicateSettled = true
      })
    const saveB = mocks.handlers.get('qingshu:save-file')?.(event, {
      path: '/notes/interleaved.md',
      content: 'save-b',
    }) as Promise<unknown>

    await Promise.resolve()
    expect(duplicateSettled).toBe(false)
    expect(order).toEqual(['read:initial', 'write:save-a'])

    releaseSaveA()
    await expect(Promise.all([saveA, duplicateOpen, saveB])).resolves.toEqual([
      { canceled: false, path: '/notes/interleaved.md' },
      {
        canceled: false,
        path: '/notes/interleaved.md',
        content: 'save-a',
      },
      { canceled: false, path: '/notes/interleaved.md' },
    ])
    expect(order).toEqual([
      'read:initial',
      'write:save-a',
      'rename:save-a',
      'read:save-a',
      'write:save-b',
      'rename:save-b',
    ])
    expect(diskContent).toBe('save-b')
    expect(documentRenameCalls()).toHaveLength(2)
  })

  it('rejects a renderer path that no dialog previously authorized', async () => {
    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/forged.md',
        content: '# Forged',
      }),
    ).rejects.toThrow('Save path was not authorized by a file dialog')

    expect(
      documentExclusiveOpenCalls(),
    ).toHaveLength(0)
    expect(documentRenameCalls()).toHaveLength(0)
  })

  it('canonically authorizes a Save As selection without writing', async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/aliases/existing.md',
    })
    mocks.realpath.mockResolvedValueOnce('/notes/existing.md')

    await expect(
      mocks.handlers.get('qingshu:choose-save-path')?.(event),
    ).resolves.toEqual({ canceled: false, path: '/notes/existing.md' })
    expect(mocks.tempHandle.writeFile).not.toHaveBeenCalled()
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
      documentExclusiveOpenCalls(),
    ).toHaveLength(0)
    expect(documentRenameCalls()).toHaveLength(0)
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
    expect(documentRenameCalls()).toHaveLength(0)
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
    expect(documentRenameCalls()).toHaveLength(0)
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
    expect(documentRenameCalls()).toHaveLength(1)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/new.md',
        content: '# Next',
      }),
    ).resolves.toMatchObject({ canceled: false, path: '/notes/new.md' })
    expect(mocks.showSaveDialog).toHaveBeenCalledOnce()
  })

  it('suppresses an unsupported directory fsync after a successful save', async () => {
    const unsupportedDirectoryError = Object.assign(new Error('directory sync unsupported'), {
      code: 'EINVAL',
    })
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/notes/windows.md',
    })
    mocks.stat.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    )
    mocks.directoryHandle.sync.mockRejectedValue(unsupportedDirectoryError)

    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, { content: '# Windows' }),
    ).resolves.toEqual({
      canceled: false,
      path: '/notes/windows.md',
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
    expect(documentRenameCalls()).toHaveLength(2)
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
    expect(documentRenameCalls()).toHaveLength(0)
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

  it('reveals only files exported by the requesting renderer', async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/reveal.html',
    })
    await mocks.handlers
      .get('qingshu:export-html')
      ?.(event, { html: '<h1>Reveal</h1>' })

    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(event, '/exports/reveal.html'),
    ).resolves.toBeUndefined()
    expect(mocks.showItemInFolder).toHaveBeenCalledWith('/exports/reveal.html')

    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(event, '/private/unexported.txt'),
    ).rejects.toThrow('File was not exported by Qingshu')
    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(event, '/exports/reveal.html'),
    ).rejects.toThrow('File was not exported by Qingshu')
  })

  it('rejects cross-renderer and replaced exported files', async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/stale.pdf',
    })
    event.sender.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    await mocks.handlers.get('qingshu:export-pdf')?.(event)

    const otherEvent = {
      ...event,
      sender: {
        ...event.sender,
        mainFrame: senderFrame,
      },
    }
    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(otherEvent, '/exports/stale.pdf'),
    ).rejects.toThrow('File was not exported by Qingshu')

    mocks.stat.mockResolvedValue({
      dev: 1,
      ino: 99,
      mode: 0o100644,
      mtimeMs: 999,
      size: 99,
    })
    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(event, '/exports/stale.pdf'),
    ).rejects.toThrow('Exported file has changed or no longer exists')
  })

  it('clears reveal authorization when the renderer navigates', async () => {
    await main.createWindow()
    const window = mocks.browserWindows.at(-1)
    window.webContents.mainFrame = senderFrame
    const windowEvent = {
      senderFrame,
      sender: window.webContents,
    }
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/reload.html',
    })
    await mocks.handlers
      .get('qingshu:export-html')
      ?.(windowEvent, { html: '<h1>Reload</h1>' })

    mocks.webContentsListeners
      .get('did-start-navigation')
      ?.({}, 'file:///workspace/dist/index.html', false, true)

    await expect(
      mocks.handlers
        .get('qingshu:show-item-in-folder')
        ?.(windowEvent, '/exports/reload.html'),
    ).rejects.toThrow('File was not exported by Qingshu')
  })

  it('atomically consumes a reveal grant before asynchronous validation', async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/concurrent.html',
    })
    await mocks.handlers
      .get('qingshu:export-html')
      ?.(event, { html: '<h1>Concurrent</h1>' })

    let releaseRealpath!: () => void
    mocks.realpath.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseRealpath = () => resolve('/exports/concurrent.html')
        }),
    )
    const firstReveal = mocks.handlers
      .get('qingshu:show-item-in-folder')
      ?.(event, '/exports/concurrent.html')
    const secondReveal = mocks.handlers
      .get('qingshu:show-item-in-folder')
      ?.(event, '/exports/concurrent.html')

    await expect(secondReveal).rejects.toThrow(
      'File was not exported by Qingshu',
    )
    releaseRealpath()
    await expect(firstReveal).resolves.toBeUndefined()
    expect(mocks.showItemInFolder).toHaveBeenCalledTimes(1)
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
      ['qingshu:show-item-in-folder', 42],
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
