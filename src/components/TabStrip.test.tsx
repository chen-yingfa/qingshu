// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  },
  {
    id: 'two',
    content: '# Two',
    dirty: true,
    activeBlock: 2,
    error: null,
    latestSaveRequest: 4,
    contentRevision: 3,
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
    expect(screen.getByRole('tab', { name: 'Untitled, unsaved' })).not.toBeNull()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'one.md' }), {
      key: 'ArrowRight',
    })
    expect(onActivate).toHaveBeenCalledWith('two')

    fireEvent.click(screen.getByRole('button', { name: 'Close Untitled' }))
    expect(onClose).toHaveBeenCalledWith('two')
  })
})
