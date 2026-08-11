// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DocumentTab } from '../hooks/useDocument'
import { TabStrip } from './TabStrip'

afterEach(cleanup)

const tabs: DocumentTab[] = [
  {
    id: 'one',
    content: '# One',
    path: '/notes/one.md',
    dirty: false,
    activeBlock: 0,
    error: null,
    latestSaveRequest: 0,
    contentRevision: 1,
    sourceMode: false,
    selection: { start: 0, end: 0, direction: 'none' },
  },
  {
    id: 'two',
    content: '# Two',
    dirty: true,
    activeBlock: 2,
    error: null,
    latestSaveRequest: 4,
    contentRevision: 3,
    sourceMode: true,
    selection: { start: 2, end: 4, direction: 'forward' },
  },
]

describe('TabStrip', () => {
  it('exposes an accessible tablist, dirty state, close controls, and arrow navigation', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(
      <TabStrip
        tabs={tabs}
        activeTabId="one"
        orientation="horizontal"
        onActivate={onActivate}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe(
      'horizontal',
    )
    expect(screen.getByRole('tab', { name: 'one.md' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(
      screen.getByRole('tab', { name: 'one.md' }).getAttribute('aria-controls'),
    ).toBe('document-panel-one')
    expect(
      screen
        .getByRole('tab', { name: 'Untitled, unsaved' })
        .getAttribute('aria-controls'),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Close one.md' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Close Untitled' }).tabIndex).toBe(
      -1,
    )

    fireEvent.keyDown(screen.getByRole('tab', { name: 'one.md' }), {
      key: 'ArrowRight',
    })
    expect(onActivate).toHaveBeenCalledWith('two')

    fireEvent.click(screen.getByRole('button', { name: 'Close Untitled' }))
    expect(onClose).toHaveBeenCalledWith('two')
  })

  it('restores focus to the activated neighbor after closing a tab', () => {
    function Harness() {
      const [current, setCurrent] = useState(tabs)
      const [active, setActive] = useState('one')
      return (
        <TabStrip
          tabs={current}
          activeTabId={active}
          orientation="horizontal"
          onActivate={setActive}
          onClose={(id) => {
            const index = current.findIndex((tab) => tab.id === id)
            const remaining = current.filter((tab) => tab.id !== id)
            setCurrent(remaining)
            if (id === active) {
              setActive(remaining[Math.min(index, remaining.length - 1)].id)
            }
          }}
        />
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Close one.md' }))

    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'Untitled, unsaved' }),
    )
  })
})
