// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App, { formatShortcut, showExportLabel } from './App'
import type { MenuCommand, QingshuApi } from './types/electron'

let menuListener: ((command: MenuCommand) => void) | undefined
let closeIntentListener: (() => void) | undefined
let api: {
  [Key in keyof QingshuApi]: ReturnType<typeof vi.fn>
} & {
  respondToClose: ReturnType<typeof vi.fn>
  onCloseIntent: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  menuListener = undefined
  closeIntentListener = undefined
  window.localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  })
  api = {
    openFile: vi.fn(),
    chooseSavePath: vi.fn().mockResolvedValue({
      canceled: false,
      path: '/notes/selected.md',
    }),
    listRecentFiles: vi.fn().mockResolvedValue({ paths: [], removed: [] }),
    openRecentFile: vi.fn(),
    saveFile: vi.fn(),
    exportHtml: vi.fn(),
    exportPdf: vi.fn(),
    showItemInFolder: vi.fn(),
    windowAction: vi.fn(),
    respondToClose: vi.fn(),
    onCloseIntent: vi.fn((listener: () => void) => {
      closeIntentListener = listener
      return vi.fn()
    }),
    onMenuCommand: vi.fn((listener: (command: MenuCommand) => void) => {
      menuListener = listener
      return vi.fn()
    }),
  }
  window.qingshu = api as unknown as QingshuApi
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('document replacement', () => {
  it('clears the same active block when creating a new document', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Draft' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
      ).toBe(''),
    )
  })

  it('loads opened content into the same active block', async () => {
    api.openFile.mockResolvedValue({
      canceled: false,
      path: '/notes/opened.md',
      content: '# Opened',
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
      ).toBe('# Opened'),
    )
  })
})

describe('document tabs', () => {
  it('links the active tab to its document tabpanel', () => {
    render(<App />)
    const tab = screen.getByRole('tab', { name: 'Untitled' })
    const panel = screen.getByRole('tabpanel')

    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
  })

  it('keeps independently edited documents and activates duplicate canonical paths', async () => {
    api.openFile
      .mockResolvedValueOnce({
        canceled: false,
        path: '/notes/one.md',
        content: '# One',
      })
      .mockResolvedValueOnce({
        canceled: false,
        path: '/notes/two.md',
        content: '# Two',
      })
      .mockResolvedValueOnce({
        canceled: false,
        path: '/notes/one.md',
        content: '# One reread',
      })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await screen.findByRole('tab', { name: 'one.md' })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '# One edited' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await screen.findByRole('tab', { name: 'two.md' })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '# Two edited' },
    })

    fireEvent.click(screen.getByRole('tab', { name: 'one.md, unsaved' }))
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('# One edited')

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'one.md, unsaved' }).getAttribute(
        'aria-selected',
      )).toBe('true'),
    )
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('# One edited')
  })

  it('confirms dirty tab closes, leaves a tab, and checks inactive dirty tabs on native close', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Unsaved first' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    closeIntentListener?.()
    expect(confirm).toHaveBeenCalledOnce()
    expect(api.respondToClose).toHaveBeenCalledWith(false)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Close Untitled' })[0],
    )
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    confirm.mockReturnValue(true)
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Close Untitled' })[0],
    )
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('loads vertical tab placement and persists changes from Settings', () => {
    window.localStorage.setItem(
      'qingshu:settings:v1',
      JSON.stringify({ tabOrientation: 'vertical' }),
    )
    render(<App />)

    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe(
      'vertical',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.change(screen.getByLabelText('Tab placement'), {
      target: { value: 'horizontal' },
    })
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe(
      'horizontal',
    )
    expect(window.localStorage.getItem('qingshu:settings:v1')).toContain(
      '"tabOrientation":"horizontal"',
    )
  })

  it.each(['horizontal', 'vertical'] as const)(
    'keeps preview and source editors in the workspace for %s and focus layouts',
    (orientation) => {
      window.localStorage.setItem(
        'qingshu:settings:v1',
        JSON.stringify({ tabOrientation: orientation }),
      )
      const { container } = render(<App />)
      const shell = container.querySelector('.app-shell')!
      const workspace = container.querySelector('.workspace-layout')!

      expect(shell.classList.contains(`tabs-${orientation}`)).toBe(true)
      expect(workspace.contains(screen.getByLabelText('Active Markdown block'))).toBe(
        true,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
      expect(workspace.contains(screen.getByLabelText('Markdown source'))).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Toggle focus mode' }))
      expect(shell.classList.contains('focus-mode')).toBe(true)
      expect(workspace.contains(screen.getByLabelText('Markdown source'))).toBe(true)
    },
  )

  it('restores each tab source mode and exact editor selection', async () => {
    render(<App />)
    const first = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(first, { target: { value: 'First selection' } })
    first.setSelectionRange(2, 8, 'backward')
    fireEvent.select(first)

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    const second = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    fireEvent.change(second, { target: { value: 'Second source selection' } })
    second.setSelectionRange(3, 12, 'forward')
    fireEvent.select(second)

    fireEvent.click(screen.getAllByRole('tab')[0])
    const restoredFirst = await screen.findByLabelText('Active Markdown block')
    expect((restoredFirst as HTMLTextAreaElement).selectionStart).toBe(2)
    expect((restoredFirst as HTMLTextAreaElement).selectionEnd).toBe(8)
    expect((restoredFirst as HTMLTextAreaElement).selectionDirection).toBe(
      'backward',
    )

    fireEvent.click(screen.getAllByRole('tab')[1])
    const restoredSecond = await screen.findByLabelText('Markdown source')
    expect((restoredSecond as HTMLTextAreaElement).selectionStart).toBe(3)
    expect((restoredSecond as HTMLTextAreaElement).selectionEnd).toBe(12)
    expect((restoredSecond as HTMLTextAreaElement).selectionDirection).toBe(
      'forward',
    )
  })

  it('ignores stale recent refresh responses and surfaces persistence warnings', async () => {
    let resolveOlder!: (value: {
      paths: string[]
      removed: string[]
    }) => void
    let resolveNewer!: (value: {
      paths: string[]
      removed: string[]
      warning?: string
    }) => void
    api.listRecentFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewer = resolve
          }),
      )
    api.openFile.mockResolvedValue({
      canceled: false,
      path: '/notes/opened.md',
      content: '# Opened',
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await waitFor(() => expect(api.listRecentFiles).toHaveBeenCalledTimes(2))
    resolveNewer({
      paths: ['/notes/newest.md'],
      removed: [],
      warning: 'Recent files could not be updated: permission denied',
    })
    await screen.findByText('Recent files could not be updated: permission denied')
    resolveOlder({ paths: ['/notes/stale.md'], removed: [] })
    await Promise.resolve()

    fireEvent.click(screen.getByRole('button', { name: 'Recent files' }))
    expect(screen.getByRole('menuitem', { name: 'newest.md' })).not.toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'stale.md' })).toBeNull()
  })

  it('shows dynamic recent commands and opens them from the compact toolbar menu', async () => {
    api.listRecentFiles.mockResolvedValue({
      paths: ['/notes/recent.md'],
      removed: ['/notes/missing.md'],
    })
    api.openRecentFile.mockResolvedValue({
      canceled: false,
      path: '/notes/recent.md',
      content: '# Recent',
    })
    render(<App />)

    expect(await screen.findByText(/Removed missing recent file: missing.md/)).not.toBeNull()
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(
      screen.getByRole('option', { name: 'Open recent.md' }),
    ).not.toBeNull()
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Command palette' }),
      { key: 'Escape' },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recent files' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'recent.md' }))
    await waitFor(() =>
      expect(api.openRecentFile).toHaveBeenCalledWith('/notes/recent.md'),
    )
    expect(await screen.findByRole('tab', { name: 'recent.md' })).not.toBeNull()
  })
})

describe('application safety controls', () => {
  it('migrates the legacy document font preference', () => {
    window.localStorage.setItem('qingshu:document-font', 'serif')
    const { container } = render(<App />)

    expect(container.querySelector('.app-shell')?.classList).toContain(
      'font-serif',
    )
  })

  it('migrates the legacy font when stored settings have a malformed shape', () => {
    window.localStorage.setItem('qingshu:document-font', 'mono')
    window.localStorage.setItem('qingshu:settings:v1', 'null')
    const { container } = render(<App />)

    expect(container.querySelector('.app-shell')?.classList).toContain(
      'font-mono',
    )
  })

  it('follows live system theme changes while theme is set to System', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: (
          _name: string,
          next: (event: { matches: boolean }) => void,
        ) => {
          listener = next
        },
        removeEventListener: vi.fn(),
      })),
    })
    const { container } = render(<App />)

    act(() => listener?.({ matches: true }))
    expect(container.querySelector('.app-shell')?.classList).toContain(
      'theme-dark',
    )
  })

  it('uses sans-serif by default and persists document font choices', () => {
    const first = render(<App />)
    const selector = screen.getByRole('combobox', {
      name: 'Document font',
    }) as HTMLSelectElement

    expect(selector.value).toBe('sans')
    expect(first.container.querySelector('.app-shell')?.classList).toContain('font-sans')

    fireEvent.change(selector, { target: { value: 'serif' } })
    expect(first.container.querySelector('.app-shell')?.classList).toContain('font-serif')
    expect(window.localStorage.getItem('qingshu:document-font')).toBe('serif')

    first.unmount()
    const second = render(<App />)
    expect(
      (screen.getByRole('combobox', { name: 'Document font' }) as HTMLSelectElement)
        .value,
    ).toBe('serif')
    expect(second.container.querySelector('.app-shell')?.classList).toContain('font-serif')
  })

  it('keeps focus mode escapable by both UI and Escape', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle focus mode' }))

    expect(container.querySelector('.app-shell')?.classList.contains('focus-mode')).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }))
    expect(container.querySelector('.app-shell')?.classList.contains('focus-mode')).toBe(
      false,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Toggle focus mode' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.app-shell')?.classList.contains('focus-mode')).toBe(
      false,
    )
  })

  it('routes a custom close through the native dirty handshake', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Unsaved' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(api.windowAction).toHaveBeenCalledWith('close')
    expect(confirm).not.toHaveBeenCalled()

    closeIntentListener?.()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(api.respondToClose).toHaveBeenCalledWith(false)
  })

  it('distinguishes rejected and confirmed native close intents', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Unsaved' },
    })

    closeIntentListener?.()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(api.respondToClose).toHaveBeenCalledWith(false)

    confirm.mockReturnValue(true)
    closeIntentListener?.()
    expect(api.respondToClose).toHaveBeenLastCalledWith(true)
  })

  it('switches to one full-document preview before PDF export', async () => {
    let finishExport: (() => void) | undefined
    api.exportPdf.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExport = () =>
            resolve({ canceled: false, path: '/notes/export.pdf' })
        }),
    )
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: {
        value: '# First\n\nReference across blocks.[^note]\n\n[^note]: Footnote text.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle focus mode' }))
    menuListener?.('export-pdf')

    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Active Markdown block')).toBeNull()
    expect(document.querySelectorAll('.rendered-block')).toHaveLength(1)
    expect(document.querySelector('.editor')?.textContent).toContain('First')
    expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
      '#user-content-fn-cp-6e-6f-74-65',
    )
    expect(
      document.getElementById('user-content-fn-cp-6e-6f-74-65')?.textContent,
    ).toContain('Footnote text')
    expect(screen.queryByRole('button', { name: 'Exit focus mode' })).toBeNull()
    finishExport?.()
    await waitFor(() =>
      expect(screen.queryByLabelText('Active Markdown block')).not.toBeNull(),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Show in/ }))
    expect(api.showItemInFolder).toHaveBeenCalledWith('/notes/export.pdf')
  })

  it('waits for fonts and current image completion before requesting PDF', async () => {
    let resolveFonts!: () => void
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })
    const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fontsReady },
    })
    api.exportPdf.mockResolvedValue({ canceled: true })

    try {
      render(<App />)
      fireEvent.change(screen.getByLabelText('Active Markdown block'), {
        target: { value: '![Diagram](https://example.com/diagram.png)' },
      })
      menuListener?.('export-pdf')

      const image = await screen.findByRole('img', { name: 'Diagram' })
      Object.defineProperty(image, 'complete', { configurable: true, value: false })
      expect(api.exportPdf).not.toHaveBeenCalled()

      resolveFonts()
      await Promise.resolve()
      expect(api.exportPdf).not.toHaveBeenCalled()

      fireEvent.error(image)
      await waitFor(() => expect(api.exportPdf).toHaveBeenCalledOnce())
    } finally {
      if (previousFonts) {
        Object.defineProperty(document, 'fonts', previousFonts)
      } else {
        Reflect.deleteProperty(document, 'fonts')
      }
    }
  })

  it('rejects a rapid duplicate PDF command without replacing the active export', async () => {
    let finishExport!: () => void
    api.exportPdf.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExport = () => resolve({ canceled: true })
        }),
    )
    render(<App />)

    menuListener?.('export-pdf')
    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledOnce())
    menuListener?.('export-pdf')

    const feedback = await screen.findByText('PDF export is already in progress.')
    expect(feedback.closest('.toast-error')).not.toBeNull()
    expect(api.exportPdf).toHaveBeenCalledOnce()

    finishExport()
    await waitFor(() =>
      expect(screen.queryByLabelText('Active Markdown block')).not.toBeNull(),
    )
    expect(api.exportPdf).toHaveBeenCalledOnce()
  })
})

describe('commands and operation feedback', () => {
  it('uses platform-specific file manager labels', () => {
    expect(showExportLabel('MacIntel')).toBe('Show in Finder')
    expect(showExportLabel('Win32')).toBe('Show in File Explorer')
    expect(showExportLabel('Linux x86_64')).toBe('Show in folder')
  })

  it('formats command shortcut labels for the active platform', () => {
    expect(formatShortcut('Mod+Shift+S', false)).toBe('Ctrl+Shift+S')
    expect(formatShortcut('Mod+Shift+S', true)).toBe('⌘⇧S')
    expect(formatShortcut('Mod+O', true)).toBe('⌘O')
  })

  it.each([
    ['b', false, '**word**'],
    ['i', false, '_word_'],
    ['c', true, '`word`'],
    ['m', true, '$word$'],
  ])(
    'runs configurable formatting hotkey Ctrl+%s',
    async (key, shiftKey, expected) => {
      render(<App />)
      const editor = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      fireEvent.change(editor, { target: { value: 'word' } })
      editor.setSelectionRange(0, 4)

      fireEvent.keyDown(editor, { key, ctrlKey: true, shiftKey })

      await waitFor(() => expect(editor.value).toBe(expected))
    },
  )

  it('ignores formatting shortcuts already handled by the editor', () => {
    render(<App />)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'word' } })
    editor.setSelectionRange(0, 4)
    const handled = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    handled.preventDefault()

    editor.dispatchEvent(handled)
    expect(editor.value).toBe('word')
  })

  it('opens settings and applies font size and a recorded hotkey', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.change(screen.getByLabelText('Document font size'), {
      target: { value: '20' },
    })
    fireEvent.keyDown(screen.getByLabelText('Shortcut for Bold'), {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(
      (container.querySelector('.app-shell') as HTMLElement).style.getPropertyValue(
        '--document-font-size',
      ),
    ).toBe('20px')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'word' } })
    editor.setSelectionRange(0, 4)
    fireEvent.keyDown(editor, {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
    })
    await waitFor(() => expect(editor.value).toBe('**word**'))
  })

  it('round-trips direct full-document edits through source mode', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '# Original' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    expect(source.value).toBe('# Original')
    fireEvent.change(source, {
      target: { value: '# Changed\n\nDirect **Markdown**' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
          .value,
      ).toBe('# Changed'),
    )
    await waitFor(() =>
      expect(document.querySelector('.editor')?.textContent).toContain(
        'Direct Markdown',
      ),
    )
  })

  it('toggles source mode with its default hotkey', () => {
    render(<App />)

    fireEvent.keyDown(window, {
      key: 'e',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(screen.getByLabelText('Markdown source')).not.toBeNull()
  })

  it('loads source mode as a persisted editor default', () => {
    window.localStorage.setItem(
      'qingshu:settings:v1',
      JSON.stringify({ defaultSourceMode: true }),
    )

    render(<App />)
    expect(screen.getByLabelText('Markdown source')).not.toBeNull()
  })

  it('does not change the startup default when source mode is toggled temporarily', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(
      (screen.getByLabelText(
        'Use source mode by default',
      ) as HTMLInputElement).checked,
    ).toBe(false)
  })

  it('keeps palette, settings, and formatting hotkeys active in source mode', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    fireEvent.change(source, { target: { value: 'word' } })
    source.setSelectionRange(0, 4)
    fireEvent.keyDown(source, { key: 'b', ctrlKey: true })
    await waitFor(() => expect(source.value).toBe('**word**'))

    fireEvent.keyDown(source, { key: 'p', ctrlKey: true })
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).not.toBeNull()
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Command palette' }),
      { key: 'Escape' },
    )

    fireEvent.keyDown(source, { key: ',', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Settings' })).not.toBeNull()
  })

  it('keeps formatting request IDs monotonic across source-mode round trips', async () => {
    render(<App />)
    let editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'word' } })
    editor.setSelectionRange(0, 4)
    fireEvent.keyDown(editor, { key: 'b', ctrlKey: true })
    await waitFor(() => expect(editor.value).toBe('**word**'))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle source mode' }))
    editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, 6)
    fireEvent.keyDown(editor, { key: 'i', ctrlKey: true })

    await waitFor(() => expect(editor.value).toBe('**_word_**'))
  })

  it('opens the palette with Ctrl+P and runs view commands from filtered keyboard input', () => {
    const { container } = render(<App />)

    for (const [query, className] of [
      ['theme', 'theme-dark'],
      ['focus', 'focus-mode'],
      ['a4', 'a4-mode'],
    ]) {
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
      const input = screen.getByRole('combobox', { name: 'Search commands' })
      fireEvent.change(input, { target: { value: query } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(
        container.querySelector('.app-shell')?.classList.contains(className),
        query,
      ).toBe(true)
    }
  })

  it('wires Ctrl+O, Ctrl+S, and Ctrl+Shift+S to the existing document bridge', async () => {
    api.openFile.mockResolvedValue({ canceled: true })
    api.saveFile.mockResolvedValue({ canceled: true })
    render(<App />)

    fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })

    await waitFor(() => expect(api.openFile).toHaveBeenCalledOnce())
    await waitFor(() => expect(api.saveFile).toHaveBeenCalledTimes(2))
    expect(api.saveFile.mock.calls[0][0]).toMatchObject({ path: undefined })
    expect(api.saveFile.mock.calls[1][0]).toMatchObject({
      path: '/notes/selected.md',
    })
  })

  it('exposes file, HTML, and PDF actions in the palette', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })

    for (const name of [
      'New document',
      'Open file',
      'Save',
      'Save as',
      'Export HTML',
      'Export PDF',
      'Bold',
      'Italic',
      'Inline code',
      'Inline math',
      'Toggle source mode',
      'Settings',
    ]) {
      expect(
        screen.getByRole('option', { name: new RegExp(`^${name}(?:, Ctrl.*)?$`) }),
      ).not.toBeNull()
    }
    expect(
      screen.getByRole('option', { name: /^Bold, Ctrl\+B$/ }),
    ).not.toBeNull()
    expect(
      screen.getByRole('option', {
        name: /^Inline math, Ctrl\+Shift\+M$/,
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('option', {
        name: /^Toggle source mode, Ctrl\+Shift\+E$/,
      }),
    ).not.toBeNull()
    fireEvent.click(
      screen.getByRole('option', { name: /^Settings, Ctrl\+,$/ }),
    )
    expect(screen.getByRole('dialog', { name: 'Settings' })).not.toBeNull()
  })

  it('shows success and error toasts for bridge operations', async () => {
    api.saveFile.mockResolvedValue({ canceled: false, path: '/notes/saved.md' })
    render(<App />)

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect((await screen.findByRole('status')).textContent).toContain('Saved saved.md')

    api.exportHtml.mockRejectedValue(new Error('Disk unavailable'))
    menuListener?.('export-html')
    await waitFor(() => expect(api.exportHtml).toHaveBeenCalledOnce())
    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(1)
    const errorToast = alerts.find((alert) => alert.classList.contains('toast-error'))
    expect(errorToast?.textContent).toContain('Disk unavailable')
  })

  it('does not announce Saved when an edit supersedes a pending Save As', async () => {
    let finishSave!: (result: { canceled: false; path: string }) => void
    api.saveFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'first draft' },
    })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(api.saveFile).toHaveBeenCalledOnce())

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'newest draft' },
    })
    finishSave({ canceled: false, path: '/notes/selected.md' })

    await waitFor(() => expect(screen.getByText('/notes/selected.md')).not.toBeNull())
    expect(screen.getByText('Unsaved')).not.toBeNull()
    expect(screen.queryByText('Saved selected.md')).toBeNull()
  })

  it('shows a durability warning without marking a superseded save clean', async () => {
    let finishSave!: (result: {
      canceled: false
      path: string
      warning: string
    }) => void
    api.saveFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'first draft' },
    })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(api.saveFile).toHaveBeenCalledOnce())

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'newest draft' },
    })
    finishSave({
      canceled: false,
      path: '/notes/selected.md',
      warning: 'Saved, but directory sync failed.',
    })

    expect(
      await screen.findByText(
        'Durability warning for selected.md: Saved, but directory sync failed.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('Unsaved')).not.toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByText('Saved selected.md')).toBeNull()
  })

  it('shows an older save warning after a newer Save As is canceled', async () => {
    let finishOlder!: (result: {
      canceled: false
      path: string
      warning: string
    }) => void
    let finishNewer!: (result: { canceled: true }) => void
    api.saveFile
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOlder = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNewer = resolve
          }),
      )
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'draft' },
    })

    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(api.saveFile).toHaveBeenCalledTimes(2))
    finishNewer({ canceled: true })
    finishOlder({
      canceled: false,
      path: '/notes/older.md',
      warning: 'Saved, but directory sync failed.',
    })

    expect(
      await screen.findByText(
        'Durability warning for older.md: Saved, but directory sync failed.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('Unsaved')).not.toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByText('Saved older.md')).toBeNull()
  })

  it('reports a committed save with a durability warning accurately', async () => {
    api.listRecentFiles
      .mockResolvedValueOnce({ paths: [], removed: [] })
      .mockResolvedValue({
        paths: ['/notes/warning.md'],
        removed: [],
      })
    api.saveFile.mockResolvedValue({
      canceled: false,
      path: '/notes/warning.md',
      warning: 'Saved, but directory sync failed.',
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'draft' },
    })

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    expect(
      await screen.findByText(
        'Saved warning.md with warning: Saved, but directory sync failed.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('Saved')).not.toBeNull()
    await waitFor(() => expect(api.listRecentFiles).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Recent files' }))
    expect(screen.getByRole('menuitem', { name: 'warning.md' })).not.toBeNull()
  })

  it('sends a rendered standalone HTML document through the existing bridge', async () => {
    api.exportHtml.mockResolvedValue({ canceled: false, path: '/exports/note.html' })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '| A | B |\n| - | - |\n| 1 | 2 |\n\n$E=mc^2$' },
    })

    menuListener?.('export-html')

    await waitFor(() => expect(api.exportHtml).toHaveBeenCalledOnce())
    const request = api.exportHtml.mock.calls[0][0] as { html: string }
    expect(request.html).toContain('<table>')
    expect(request.html).toContain('class="katex"')
    expect(request.html).toContain('<meta charset="utf-8">')
    expect(request.html).toContain('<style>')
    fireEvent.click(await screen.findByRole('button', { name: /Show in/ }))
    expect(api.showItemInFolder).toHaveBeenCalledWith('/exports/note.html')
  })

  it('shows an error when the exported file can no longer be revealed', async () => {
    api.exportHtml.mockResolvedValue({
      canceled: false,
      path: '/exports/missing.html',
    })
    api.showItemInFolder.mockRejectedValue(new Error('Exported file is missing'))
    render(<App />)

    menuListener?.('export-html')
    fireEvent.click(await screen.findByRole('button', { name: /Show in/ }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Exported file is missing',
    )
  })
})
