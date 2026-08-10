import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  fromWebContents: vi.fn(),
  browserWindows: [] as any[],
  browserWindowOptions: [] as any[],
  webContentsListeners: new Map<string, (...args: any[]) => unknown>(),
  windowOpenHandler: undefined as undefined | ((details: { url: string }) => unknown),
  guardsInstalledAtLoad: [] as boolean[][],
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}))

vi.mock('electron', () => ({
  app: {
    disableHardwareAcceleration: vi.fn(),
    getName: () => 'Qingshu',
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    whenReady: () => new Promise(() => undefined),
  },
  BrowserWindow: class {
    static fromWebContents = mocks.fromWebContents
    static getAllWindows = () => []

    webContents = {
      on: vi.fn((name: string, listener: (...args: any[]) => unknown) => {
        mocks.webContentsListeners.set(name, listener)
      }),
      printToPDF: vi.fn(),
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
  })

  it('registers only the renderer bridge channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      'qingshu:export-html',
      'qingshu:export-pdf',
      'qingshu:open-file',
      'qingshu:save-file',
      'qingshu:window-action',
    ])
  })

  it('opens a selected Markdown file as UTF-8', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/notes/hello.md'] })
    mocks.readFile.mockResolvedValue('# 你好')

    await expect(mocks.handlers.get('qingshu:open-file')?.(event)).resolves.toEqual({
      canceled: false,
      path: '/notes/hello.md',
      content: '# 你好',
    })
    expect(mocks.readFile).toHaveBeenCalledWith('/notes/hello.md', 'utf8')
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
    await expect(
      mocks.handlers.get('qingshu:save-file')?.(event, {
        path: '/notes/hello.md',
        content: '# Updated',
      }),
    ).resolves.toEqual({ canceled: false, path: '/notes/hello.md' })

    expect(mocks.showSaveDialog).not.toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith('/notes/hello.md', '# Updated', 'utf8')
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

    await expect(mocks.handlers.get('qingshu:export-pdf')?.(event, {})).resolves.toEqual({
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
      mocks.handlers.get('qingshu:export-pdf')?.(event, {}),
    ).resolves.toEqual({ canceled: true })
    expect(event.sender.printToPDF).not.toHaveBeenCalled()
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

describe('close confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('destroys the window only after confirmation', async () => {
    let closeListener: ((event: { preventDefault: () => void }) => void) | undefined
    const window = {
      destroy: vi.fn(),
      isDestroyed: () => false,
      on: vi.fn((name: string, listener: typeof closeListener) => {
        if (name === 'close') closeListener = listener
      }),
    }
    const preventDefault = vi.fn()
    mocks.showMessageBox.mockResolvedValue({ response: 1 })

    main.installCloseConfirmation(window as never)
    closeListener?.({ preventDefault })
    await vi.waitFor(() => expect(window.destroy).toHaveBeenCalledOnce())

    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps the window open when close confirmation is canceled', async () => {
    let closeListener: ((event: { preventDefault: () => void }) => void) | undefined
    const window = {
      destroy: vi.fn(),
      isDestroyed: () => false,
      on: vi.fn((name: string, listener: typeof closeListener) => {
        if (name === 'close') closeListener = listener
      }),
    }
    mocks.showMessageBox.mockResolvedValue({ response: 0 })

    main.installCloseConfirmation(window as never)
    closeListener?.({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(mocks.showMessageBox).toHaveBeenCalledOnce())

    expect(window.destroy).not.toHaveBeenCalled()
  })
})
