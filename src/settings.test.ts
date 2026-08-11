import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  eventToShortcut,
  loadSettings,
  matchesShortcut,
  shortcutLabel,
} from './settings'

describe('settings', () => {
  it('loads defaults and safely merges valid persisted values', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
    const loaded = loadSettings(
      JSON.stringify({
        theme: 'dark',
        font: 'serif',
        fontSize: 22,
        defaultA4: true,
        autoSpacing: true,
        shortcuts: { bold: 'Ctrl+Shift+B', save: 42 },
      }),
    )

    expect(loaded).toMatchObject({
      theme: 'dark',
      font: 'serif',
      fontSize: 22,
      defaultA4: true,
      autoSpacing: true,
    })
    expect(loaded.shortcuts.bold).toBe('Ctrl+Shift+B')
    expect(loaded.shortcuts.save).toBe(DEFAULT_SETTINGS.shortcuts.save)
  })

  it('records and exactly matches cross-platform shortcuts', () => {
    expect(
      eventToShortcut({
        key: 'b',
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
        altKey: false,
      }),
    ).toBe('Ctrl+Shift+B')
    expect(
      matchesShortcut(
        {
          key: 'b',
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        },
        'Ctrl+B',
      ),
    ).toBe(true)
    expect(
      matchesShortcut(
        {
          key: 'b',
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
          altKey: false,
        },
        'Ctrl+B',
      ),
    ).toBe(false)
    expect(
      eventToShortcut({
        key: 'b',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBeUndefined()
  })

  it('formats shortcuts for command-palette display', () => {
    expect(shortcutLabel('Ctrl+Shift+S', true)).toBe('⌘⇧S')
    expect(shortcutLabel('Ctrl+`', false)).toBe('Ctrl+`')
    expect(shortcutLabel('', false)).toBe('')
  })
})
