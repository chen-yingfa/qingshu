// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TitleBar } from './TitleBar'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TitleBar', () => {
  it('omits custom window controls when macOS native controls are present', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { container } = render(<TitleBar dirty={false} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Minimize window' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close window' })).toBeNull()
    expect(
      container.querySelector('.title-bar')?.classList.contains(
        'title-bar-native-mac',
      ),
    ).toBe(true)
  })

  it('does not reserve the native traffic-light inset on other platforms', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64')
    const { container } = render(<TitleBar dirty={false} onClose={vi.fn()} />)

    expect(
      container.querySelector('.title-bar')?.classList.contains(
        'title-bar-native-mac',
      ),
    ).toBe(false)
  })
})
