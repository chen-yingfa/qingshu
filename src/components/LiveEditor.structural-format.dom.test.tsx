// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveEditor } from './LiveEditor'

afterEach(cleanup)

function FormattingEditor({
  initialContent,
  command,
  onChange,
  onSelectionChange,
}: {
  initialContent: string
  command: 'heading' | 'quote' | 'unordered-list'
  onChange?(content: string): void
  onSelectionChange?: ComponentProps<typeof LiveEditor>['onSelectionChange']
}) {
  const [content, setContent] = useState(initialContent)
  const [activeBlock, setActiveBlock] = useState(0)
  const [requestId, setRequestId] = useState(0)
  return (
    <>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setRequestId((id) => id + 1)}
      >
        Format
      </button>
      <LiveEditor
        content={content}
        activeBlock={activeBlock}
        formatRequest={
          requestId > 0 ? { id: requestId, command } : undefined
        }
        onChange={(nextContent) => {
          onChange?.(nextContent)
          setContent(nextContent)
        }}
        onActiveBlockChange={setActiveBlock}
        onSelectionChange={onSelectionChange}
      />
    </>
  )
}

describe('LiveEditor structural formatting transactions', () => {
  it('formats multiline prose as isolated bullet items and undoes the transaction', async () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    const result = render(
      <FormattingEditor
        initialContent={'duplicate\r\n\tchild\r\nduplicate'}
        command="unordered-list"
        onChange={onChange}
        onSelectionChange={onSelectionChange}
      />,
    )
    const original = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    original.focus()
    original.setSelectionRange(0, original.value.length)
    fireEvent.select(original)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))

    await waitFor(() => {
      const active = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      expect(onChange).toHaveBeenLastCalledWith(
        '- duplicate\r\n- \tchild\r\n- duplicate',
      )
      expect(active.value).toBe('duplicate')
      expect(active.selectionStart).toBe(0)
      expect(active.selectionEnd).toBe(9)
      expect(document.activeElement).toBe(active)
      expect(
        result.container.querySelectorAll('.semantic-list-item-row'),
      ).toHaveLength(3)
    })
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      start: 0,
      end: 11,
      direction: 'none',
    })

    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'z',
      ctrlKey: true,
    })

    await waitFor(() => {
      const restored = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      expect(onChange).toHaveBeenLastCalledWith(
        'duplicate\r\n\tchild\r\nduplicate',
      )
      expect(restored.value).toBe('duplicate\n\tchild\nduplicate')
      expect(restored.selectionStart).toBe(0)
      expect(restored.selectionEnd).toBe(26)
      expect(document.activeElement).toBe(restored)
    })
  })

  it('formats multiline prose as a quote and undoes with the original selection', async () => {
    const onChange = vi.fn()
    render(
      <FormattingEditor
        initialContent={'same\r\nsame'}
        command="quote"
        onChange={onChange}
      />,
    )
    const original = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    original.focus()
    original.setSelectionRange(0, original.value.length, 'backward')
    fireEvent.select(original)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))

    await waitFor(() => {
      const quote = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      expect(onChange).toHaveBeenLastCalledWith('> same\r\n> same')
      expect(quote.value).toBe('same\nsame')
      expect(quote.selectionStart).toBe(0)
      expect(quote.selectionEnd).toBe(9)
      expect(document.activeElement).toBe(quote)
    })

    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'z',
      ctrlKey: true,
    })

    await waitFor(() => {
      const restored = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      expect(onChange).toHaveBeenLastCalledWith('same\r\nsame')
      expect(restored.value).toBe('same\nsame')
      expect(restored.selectionStart).toBe(0)
      expect(restored.selectionEnd).toBe(9)
      expect(restored.selectionDirection).toBe('backward')
      expect(document.activeElement).toBe(restored)
    })
  })
})
