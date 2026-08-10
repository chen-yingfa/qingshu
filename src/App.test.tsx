// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
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
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  })
  api = {
    openFile: vi.fn(),
    saveFile: vi.fn(),
    exportHtml: vi.fn(),
    exportPdf: vi.fn(),
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

  it('switches every block to rendered preview before PDF export', async () => {
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
      target: { value: '# First\n\nSecond' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle focus mode' }))
    menuListener?.('export-pdf')

    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Active Markdown block')).toBeNull()
    expect(document.querySelectorAll('.rendered-block')).toHaveLength(2)
    expect(document.querySelector('.editor')?.textContent).toContain('First')
    expect(document.querySelector('.editor')?.textContent).toContain('Second')
    expect(screen.queryByRole('button', { name: 'Exit focus mode' })).toBeNull()
    finishExport?.()
    await waitFor(() =>
      expect(screen.queryByLabelText('Active Markdown block')).not.toBeNull(),
    )
  })
})

describe('commands and operation feedback', () => {
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
      expect(container.querySelector('.app-shell')?.classList.contains(className)).toBe(true)
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
    ]) {
      expect(
        screen.getByRole('option', { name: new RegExp(`^${name}(?:\\s+Ctrl.*)?$`) }),
      ).not.toBeNull()
    }
  })

  it('shows success and error toasts for bridge operations', async () => {
    api.saveFile.mockResolvedValue({ canceled: false, path: '/notes/saved.md' })
    render(<App />)

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect((await screen.findByRole('status')).textContent).toContain('Saved saved.md')

    api.exportHtml.mockRejectedValue(new Error('Disk unavailable'))
    menuListener?.('export-html')
    expect((await screen.findByRole('alert')).textContent).toContain('Disk unavailable')
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
  })
})
