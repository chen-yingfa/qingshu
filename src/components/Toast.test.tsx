// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastRegion, type ToastMessage } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ToastRegion', () => {
  it('uses status and alert semantics for success and error feedback', () => {
    const toasts: ToastMessage[] = [
      { id: 1, tone: 'success', message: 'Saved note.md' },
      { id: 2, tone: 'error', message: 'Save failed' },
    ]

    render(<ToastRegion toasts={toasts} onDismiss={vi.fn()} />)

    expect(screen.getByRole('status').textContent).toContain('Saved note.md')
    expect(screen.getByRole('alert').textContent).toContain('Save failed')
    expect(
      screen.getByRole('button', { name: 'Dismiss notification: Saved note.md' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Dismiss notification: Save failed' }),
    ).not.toBeNull()
  })

  it('can be dismissed immediately and expires automatically', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <ToastRegion
        toasts={[{ id: 7, tone: 'success', message: 'Exported HTML' }]}
        onDismiss={onDismiss}
        duration={3000}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification: Exported HTML' }),
    )
    expect(onDismiss).toHaveBeenCalledWith(7)

    vi.advanceTimersByTime(3000)
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('runs an export action and dismisses its notification', () => {
    const onDismiss = vi.fn()
    const onAction = vi.fn()
    render(
      <ToastRegion
        toasts={[
          {
            id: 9,
            tone: 'success',
            message: 'Exported note.pdf',
            action: { label: 'Show in folder', onClick: onAction },
          },
        ]}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show in folder' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledWith(9)
  })
})
