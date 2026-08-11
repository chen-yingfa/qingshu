// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toolbar } from './Toolbar'

afterEach(cleanup)

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
