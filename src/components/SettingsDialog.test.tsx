// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadSettings } from '../settings'
import { SettingsDialog } from './SettingsDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SettingsDialog', () => {
  it('separates editor defaults and hotkeys into accessible tabs', () => {
    render(
      <SettingsDialog
        settings={loadSettings(null)}
        onChange={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('tab', { name: 'Editor' }).getAttribute(
        'aria-selected',
      ),
    ).toBe('true')
    expect(screen.queryByLabelText('Shortcut for Bold')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Hotkeys' }))
    expect(screen.getByLabelText('Shortcut for Bold')).not.toBeNull()
    expect(screen.queryByLabelText('Document font size')).toBeNull()
  })

  it('uses spaced system-font Command and Shift symbols on macOS', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    render(
      <SettingsDialog
        settings={loadSettings(null, true)}
        onChange={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Hotkeys' }))

    expect(
      (screen.getByLabelText('Shortcut for Inline code') as HTMLInputElement)
        .value,
    ).toBe('⌘ ⇧ C')
  })

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

    fireEvent.click(screen.getByLabelText('Use source mode by default'))
    expect(onChange.mock.calls.at(-1)?.[0].defaultSourceMode).toBe(true)

    fireEvent.click(
      screen.getByLabelText('Convert Yen and middle-dot shortcuts'),
    )
    expect(onChange.mock.calls.at(-1)?.[0].cjkShortcuts).toBe(false)

    fireEvent.change(screen.getByLabelText('Tab placement'), {
      target: { value: 'vertical' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].tabOrientation).toBe('vertical')

    fireEvent.click(screen.getByRole('tab', { name: 'Hotkeys' }))
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

    fireEvent.click(screen.getByRole('tab', { name: 'Hotkeys' }))
    fireEvent.keyDown(screen.getByLabelText('Shortcut for Bold'), {
      key: 'Delete',
    })
    expect(onChange.mock.calls.at(-1)?.[0].shortcuts.bold).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }))
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(loadSettings(null))
  })

  it('rejects conflicts and lets Tab and Escape control the dialog', () => {
    const onChange = vi.fn()
    const onDismiss = vi.fn()
    render(
      <SettingsDialog
        settings={loadSettings(null)}
        onChange={onChange}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Hotkeys' }))
    const bold = screen.getByLabelText('Shortcut for Bold')

    fireEvent.keyDown(bold, { key: 'i', ctrlKey: true })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      'already assigned to Italic',
    )

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    bold.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)

    fireEvent.keyDown(bold, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('contains Escape so it only dismisses the settings dialog', () => {
    const onDismiss = vi.fn()
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    render(
      <SettingsDialog
        settings={loadSettings(null)}
        onChange={vi.fn()}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(outside).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outside)
  })
})
