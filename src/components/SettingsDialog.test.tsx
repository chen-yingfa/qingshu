// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadSettings } from '../settings'
import { SettingsDialog } from './SettingsDialog'

afterEach(cleanup)

describe('SettingsDialog', () => {
  it('edits defaults, font size, and records shortcuts', () => {
    let settings = loadSettings(null)
    const onChange = vi.fn((next) => {
      settings = next
    })
    const result = render(
      <SettingsDialog
        settings={settings}
        onChange={onChange}
        onDismiss={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Settings document font'), {
      target: { value: 'serif' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].font).toBe('serif')

    result.rerender(
      <SettingsDialog
        settings={{ ...settings, font: 'serif' }}
        onChange={onChange}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Document font size'), {
      target: { value: '21' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].fontSize).toBe(21)

    fireEvent.keyDown(screen.getByLabelText('Shortcut for Bold'), {
      key: 'k',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(onChange.mock.calls.at(-1)?.[0].shortcuts.bold).toBe(
      'Ctrl+Shift+K',
    )
  })

  it('clears shortcuts and resets defaults', () => {
    const settings = loadSettings(null)
    const onChange = vi.fn()
    render(
      <SettingsDialog
        settings={settings}
        onChange={onChange}
        onDismiss={vi.fn()}
      />,
    )

    fireEvent.keyDown(screen.getByLabelText('Shortcut for Bold'), {
      key: 'Delete',
    })
    expect(onChange.mock.calls.at(-1)?.[0].shortcuts.bold).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }))
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(loadSettings(null))
  })
})
