// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StatusBar } from './StatusBar'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StatusBar', () => {
  it('shows the active block and saved state', () => {
    const { rerender } = render(
      <StatusBar
        content="One"
        error={null}
        activeBlock={1}
        dirty={false}
        path="/notes/one.md"
      />,
    )

    expect(screen.getByText('Block 2')).not.toBeNull()
    expect(screen.getByText('Saved')).not.toBeNull()

    rerender(
      <StatusBar
        content="One!"
        error={null}
        activeBlock={1}
        dirty
        path="/notes/one.md"
      />,
    )
    expect(screen.getByText('Unsaved')).not.toBeNull()
  })

  it('debounces statistics after document edits', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <StatusBar
        content="one"
        error={null}
        activeBlock={0}
        dirty={false}
      />,
    )
    expect(screen.getByText('3 characters')).not.toBeNull()

    rerender(
      <StatusBar
        content="one two three"
        error={null}
        activeBlock={0}
        dirty
      />,
    )
    expect(screen.getByText('3 characters')).not.toBeNull()

    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByText('13 characters')).not.toBeNull()
  })

  it('does not create a second assertive error announcement', () => {
    render(
      <StatusBar
        content=""
        error="Disk unavailable"
        activeBlock={0}
        dirty
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Disk unavailable')).not.toBeNull()
  })
})
