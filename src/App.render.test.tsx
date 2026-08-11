// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { memo } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const renderCounts = vi.hoisted(() => ({ toolbar: 0, tabs: 0 }))

vi.mock('./components/Toolbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/Toolbar')>()
  return {
    ...actual,
    Toolbar: memo((props: Parameters<typeof actual.Toolbar>[0]) => {
      renderCounts.toolbar += 1
      return <actual.Toolbar {...props} />
    }),
  }
})

vi.mock('./components/TabStrip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/TabStrip')>()
  return {
    ...actual,
    TabStrip: memo(
      (props: Parameters<typeof actual.TabStrip>[0]) => {
        renderCounts.tabs += 1
        return <actual.TabStrip {...props} />
      },
      (previous, next) =>
        previous.activeTabId === next.activeTabId &&
        previous.orientation === next.orientation &&
        previous.onActivate === next.onActivate &&
        previous.onClose === next.onClose &&
        previous.tabs.length === next.tabs.length &&
        previous.tabs.every((tab, index) => {
          const candidate = next.tabs[index]
          return (
            tab.id === candidate.id &&
            tab.path === candidate.path &&
            tab.dirty === candidate.dirty
          )
        }),
    ),
  }
})

import App from './App'
import type { QingshuApi } from './types/electron'

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  })
  window.qingshu = {
    listRecentFiles: vi.fn().mockResolvedValue({ paths: [], removed: [] }),
    onCloseIntent: vi.fn(() => vi.fn()),
  } as unknown as QingshuApi
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('does not rerender shell controls for active document keystrokes', () => {
  render(<App />)
  const editor = screen.getByLabelText('Active Markdown block')
  fireEvent.change(editor, { target: { value: 'first' } })
  renderCounts.toolbar = 0
  renderCounts.tabs = 0

  fireEvent.change(editor, {
    target: { value: 'second' },
  })

  expect(renderCounts.toolbar).toBe(0)
  expect(renderCounts.tabs).toBe(0)
})
