// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toolbar } from './Toolbar'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderToolbar() {
  const onRecent = vi.fn()
  render(
    <Toolbar
      dark={false}
      focus={false}
      a4={false}
      autoSpacing={false}
      sourceMode={false}
      documentFont="sans"
      recentPaths={['/notes/one.md', '/notes/two.md', '/notes/three.md']}
      onFile={vi.fn()}
      onFormat={vi.fn()}
      onFontChange={vi.fn()}
      onSettings={vi.fn()}
      onRecent={onRecent}
      onToggle={vi.fn()}
    />,
  )
  return onRecent
}

describe('recent files menu', () => {
  it('focuses and navigates menuitems with menu keyboard semantics', () => {
    renderToolbar()
    const trigger = screen.getByRole('button', { name: 'Recent files' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')

    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: 'End' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(items[2], { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[2])

    fireEvent.keyDown(items[2], { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('dismisses on outside interaction and invokes a menuitem', () => {
    const onRecent = renderToolbar()
    const trigger = screen.getByRole('button', { name: 'Recent files' })
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'two.md' }))
    expect(onRecent).toHaveBeenCalledWith('/notes/two.md')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('toolbar tooltips', () => {
  it('associates buttons with a custom tooltip only while it is visible', () => {
    renderToolbar()

    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-describedby')).toBeNull()
      expect(button.getAttribute('title')).toBeNull()
      fireEvent.mouseEnter(button)
      const tooltipId = button.getAttribute('aria-describedby')
      const tooltip = document.getElementById(tooltipId!)
      expect(tooltip?.getAttribute('role')).toBe('tooltip')
      expect(tooltip?.textContent).toBe(button.getAttribute('aria-label'))
      fireEvent.mouseLeave(button)
      expect(button.getAttribute('aria-describedby')).toBeNull()
    }
  })

  it('shows the recent-files tooltip on hover and keyboard focus', () => {
    renderToolbar()
    const button = screen.getByRole('button', { name: 'Recent files' })

    fireEvent.mouseEnter(button)
    const tooltip = document.getElementById(button.getAttribute('aria-describedby')!)
    expect(tooltip?.getAttribute('data-visible')).toBe('true')
    fireEvent.mouseLeave(button)
    expect(tooltip?.getAttribute('data-visible')).toBe('false')
    fireEvent.focus(button)
    expect(tooltip?.getAttribute('data-visible')).toBe('true')
    fireEvent.blur(button)
    expect(tooltip?.getAttribute('data-visible')).toBe('false')
  })

  it('measures a wrapped tooltip and flips it inside a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 100)
    vi.stubGlobal('innerHeight', 100)
    renderToolbar()
    const button = screen.getByRole('button', { name: 'Recent files' })
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 2,
      y: 70,
      top: 70,
      right: 22,
      bottom: 90,
      left: 2,
      width: 20,
      height: 20,
      toJSON: () => ({}),
    })
    const tooltip = button.querySelector('[role="tooltip"]') as HTMLElement
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 84,
      bottom: 50,
      left: 0,
      width: 84,
      height: 50,
      toJSON: () => ({}),
    })

    fireEvent.mouseEnter(button)

    expect(tooltip.style.getPropertyValue('--tooltip-left')).toBe('8px')
    expect(tooltip.style.getPropertyValue('--tooltip-top')).toBe('13px')
  })

  it('remeasures a visible tooltip on viewport resize and scroll', () => {
    renderToolbar()
    const button = screen.getByRole('button', { name: 'Recent files' })
    let left = 20
    vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => ({
      x: left,
      y: 10,
      top: 10,
      right: left + 20,
      bottom: 30,
      left,
      width: 20,
      height: 20,
      toJSON: () => ({}),
    }))
    const tooltip = button.querySelector('[role="tooltip"]') as HTMLElement
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 60,
      bottom: 20,
      left: 0,
      width: 60,
      height: 20,
      toJSON: () => ({}),
    })
    fireEvent.mouseEnter(button)
    const initial = tooltip.style.getPropertyValue('--tooltip-left')

    left = 200
    fireEvent(window, new Event('resize'))
    expect(tooltip.style.getPropertyValue('--tooltip-left')).not.toBe(initial)
    left = 300
    fireEvent.scroll(window)
    expect(tooltip.style.getPropertyValue('--tooltip-left')).toBe('280px')
  })
})
