// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CommandPalette,
  fuzzyFilterCommands,
  type PaletteCommand,
} from './CommandPalette'

function commands(): PaletteCommand[] {
  return [
    {
      id: 'open',
      label: 'Open file',
      shortcut: 'Ctrl+O',
      keywords: ['load', 'document'],
      run: vi.fn(),
    },
    {
      id: 'theme',
      label: 'Toggle color theme',
      keywords: ['dark', 'light', 'appearance'],
      run: vi.fn(),
    },
    {
      id: 'html',
      label: 'Export HTML',
      keywords: ['web', 'document'],
      run: vi.fn(),
    },
  ]
}

afterEach(cleanup)

describe('fuzzyFilterCommands', () => {
  it('matches ordered fuzzy characters across labels', () => {
    expect(fuzzyFilterCommands(commands(), 'tct').map((command) => command.id)).toEqual([
      'theme',
    ])
  })

  it('matches keywords and ranks a label prefix first', () => {
    expect(fuzzyFilterCommands(commands(), 'open').map((command) => command.id)).toEqual([
      'open',
    ])
    expect(fuzzyFilterCommands(commands(), 'web').map((command) => command.id)).toEqual([
      'html',
    ])
  })
})

describe('CommandPalette keyboard interaction', () => {
  it('uses safe option IDs and a complete combobox relationship', () => {
    const available = commands()
    available.push({
      id: 'recent:/notes/2026 draft #1.md',
      label: 'Open draft',
      keywords: ['recent'],
      run: vi.fn(),
    })
    render(<CommandPalette commands={available} onDismiss={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'draft' } })
    const activeId = input.getAttribute('aria-activedescendant')!

    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
    expect(document.getElementById(activeId)).toBe(
      screen.getByRole('option', { name: 'Open draft' }),
    )
    expect(activeId).not.toMatch(/[\\/#\s]/u)
  })

  it('moves selection with arrows and executes the selected command with Enter', () => {
    const available = commands()
    const onDismiss = vi.fn()
    render(<CommandPalette commands={available} onDismiss={onDismiss} />)

    const input = screen.getByRole('combobox', { name: 'Search commands' })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(available[1].run).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('filters from the keyboard, announces an empty result, and dismisses with Escape', () => {
    const onDismiss = vi.fn()
    render(<CommandPalette commands={commands()} onDismiss={onDismiss} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })

    fireEvent.change(input, { target: { value: 'not a command' } })
    expect(screen.getByText('No matching commands')).not.toBeNull()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses with Escape after focus moves to a command option', () => {
    const onDismiss = vi.fn()
    render(<CommandPalette commands={commands()} onDismiss={onDismiss} />)

    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('traps Tab and Shift+Tab within every dialog control', () => {
    render(<CommandPalette commands={commands()} onDismiss={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    const options = screen.getAllByRole('option')

    options.at(-1)?.focus()
    fireEvent.keyDown(options.at(-1)!, { key: 'Tab' })
    expect(document.activeElement).toBe(input)

    input.focus()
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(options.at(-1))
  })

  it('handles arrows from an option and returns focus to the combobox', () => {
    render(<CommandPalette commands={commands()} onDismiss={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    const options = screen.getAllByRole('option')
    options[0].focus()

    fireEvent.keyDown(options[0], { key: 'ArrowDown' })

    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(input)
  })

  it('restores focus to the opener after dismissal', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open commands
          </button>
          {open && <CommandPalette commands={commands()} onDismiss={() => setOpen(false)} />}
        </>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open commands' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
