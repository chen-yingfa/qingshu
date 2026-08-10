// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
})
