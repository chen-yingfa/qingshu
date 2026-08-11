// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { BlockDragHandle, BlockDropZone } from './BlockDragControls'

it('supports keyboard moves from the extracted drag handle', () => {
  const onMove = vi.fn()
  render(
    <BlockDragHandle
      index={1}
      onPointerDown={vi.fn()}
      onMove={onMove}
    />,
  )

  fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 2' }), {
    key: 'ArrowUp',
    altKey: true,
  })

  expect(onMove).toHaveBeenCalledWith(-1)
})

it('targets a matching active pointer in the extracted drop zone', () => {
  const onTarget = vi.fn()
  const { container } = render(
    <BlockDropZone
      boundary={2}
      dragging
      pointerId={7}
      active={false}
      onTarget={onTarget}
    />,
  )

  fireEvent.pointerEnter(container.firstElementChild!, { pointerId: 7 })

  expect(onTarget).toHaveBeenCalledWith(2)
})
