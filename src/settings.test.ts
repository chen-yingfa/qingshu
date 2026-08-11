import { describe, expect, it } from 'vitest'

import {
  canonicalizeShortcut,
  DEFAULT_SETTINGS,
  eventToShortcut,
  loadSettings,
  matchesShortcut,
  shortcutLabel,
  shortcutSignature,
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
        tabOrientation: 'vertical',
        autoSpacing: true,
        shortcuts: { bold: 'Ctrl+Shift+B', save: 42 },
      }),
    )

    expect(loaded).toMatchObject({
      theme: 'dark',
      font: 'serif',
      fontSize: 22,
      defaultA4: true,
      tabOrientation: 'vertical',
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
    ).toBe('Cmd+Shift+B')
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
    expect(
      matchesShortcut(
        {
          key: 'b',
          ctrlKey: false,
          metaKey: true,
          shiftKey: false,
          altKey: false,
        },
        'Mod+B',
        true,
      ),
    ).toBe(true)
    expect(
      matchesShortcut(
        {
          key: 'b',
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        },
        'Mod+B',
        false,
      ),
    ).toBe(true)
  })

  it('formats shortcuts for command-palette display', () => {
    expect(shortcutLabel('Mod+Shift+S', true)).toBe('⌘⇧S')
    expect(shortcutLabel('Mod+Shift+S', false)).toBe('Ctrl+Shift+S')
    expect(shortcutLabel('Ctrl+`', false)).toBe('Ctrl+`')
    expect(shortcutLabel('', false)).toBe('')
  })

  it('drops duplicate or malformed persisted shortcuts', () => {
    const settings = loadSettings(
      JSON.stringify({
        shortcuts: {
          bold: 'Mod+I',
          italic: 'Mod+I',
          inlineMath: 'M',
        },
      }),
    )

    expect(settings.shortcuts.bold).toBe('Mod+I')
    expect(settings.shortcuts.italic).toBe('')
    expect(settings.shortcuts.inlineMath).toBe(DEFAULT_SETTINGS.shortcuts.inlineMath)

    expect(
      loadSettings(
        JSON.stringify({
          shortcuts: { bold: 'Mod+B', italic: 'Ctrl+B' },
        }),
        false,
      ).shortcuts.italic,
    ).toBe('')
    expect(
      loadSettings(
        JSON.stringify({
          shortcuts: { bold: 'Mod+B', italic: 'Cmd+B' },
        }),
        true,
      ).shortcuts.italic,
    ).toBe('')
  })

  it('canonicalizes modifier order and compares effective bindings', () => {
    expect(canonicalizeShortcut('Shift+Ctrl+b')).toBe('Ctrl+Shift+B')
    expect(canonicalizeShortcut('Mod+Ctrl+B')).toBeUndefined()
    expect(shortcutSignature('Mod+B', false)).toBe(
      shortcutSignature('Ctrl+B', false),
    )
    expect(shortcutSignature('Mod+B', true)).toBe(
      shortcutSignature('Cmd+B', true),
    )
  })
})
