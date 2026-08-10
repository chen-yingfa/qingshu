// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { MenuCommand, QingshuApi } from './types/electron'

let menuListener: ((command: MenuCommand) => void) | undefined
let api: {
  [Key in keyof QingshuApi]: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  menuListener = undefined
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

  it('confirms dirty documents before a custom window close', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Unsaved' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(api.windowAction).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(api.windowAction).toHaveBeenCalledWith('close')
  })

  it('switches every block to rendered preview before PDF export', async () => {
    api.exportPdf.mockImplementation(async () => {
      expect(screen.queryByLabelText('Active Markdown block')).toBeNull()
      expect(document.querySelectorAll('.rendered-block')).toHaveLength(2)
      expect(document.querySelector('.editor')?.textContent).toContain('First')
      expect(document.querySelector('.editor')?.textContent).toContain('Second')
      return { canceled: false, path: '/notes/export.pdf' }
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '# First\n\nSecond' },
    })

    menuListener?.('export-pdf')

    await waitFor(() => expect(api.exportPdf).toHaveBeenCalledTimes(1))
  })
})
