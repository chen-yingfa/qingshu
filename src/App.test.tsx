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
    expect(api.saveFile.mock.calls[1][0]).toMatchObject({ path: undefined })
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
