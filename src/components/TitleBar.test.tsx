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
    const titleBar = container.querySelector('.title-bar') as HTMLElement
    expect(titleBar.style.gridTemplateColumns).toBe('116px 1fr 116px')
    expect(container.querySelector('.brand-mark')).toBeNull()
  })

  it('does not reserve the native traffic-light inset on other platforms', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64')
    const { container } = render(<TitleBar dirty={false} onClose={vi.fn()} />)

    expect(
      container.querySelector('.title-bar')?.classList.contains(
        'title-bar-native-mac',
      ),
    ).toBe(false)
    const titleBar = container.querySelector('.title-bar') as HTMLElement
    const brand = container.querySelector('.brand-mark') as HTMLElement
    expect(titleBar.style.gridTemplateColumns).toBe('')
    expect(brand.style.marginLeft).toBe('')
    expect(brand.textContent).toBe('Q')
  })
})
