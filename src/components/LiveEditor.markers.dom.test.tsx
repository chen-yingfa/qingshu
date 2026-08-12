// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveEditor } from './LiveEditor'

afterEach(cleanup)

function ControlledEditor({
  initial,
  sourceMode = false,
}: {
  initial: string
  sourceMode?: boolean
}) {
  const [content, setContent] = useState(initial)
  const [activeBlock, setActiveBlock] = useState(0)
  return (
    <LiveEditor
      content={content}
      contentRevision={0}
      activeBlock={activeBlock}
      sourceMode={sourceMode}
      onChange={setContent}
      onActiveBlockChange={setActiveBlock}
    />
  )
}

describe('LiveEditor marker projection', () => {
  it.each([
    ['- item', 'item'],
    ['* item', 'item'],
    ['+ item', 'item'],
    ['007. item', 'item'],
    ['09) item', 'item'],
    ['- [x] done', 'done'],
  ])('hides the active top-level marker for %s', (source, visible) => {
    const result = render(<ControlledEditor initial={source} />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement

    expect(editor.value).toBe(visible)
    expect(result.container.querySelectorAll('li.semantic-list-item-row')).toHaveLength(1)
  })

  it('edits prose and nested source while preserving exact marker syntax', () => {
    const onChange = vi.fn()
    render(
      <LiveEditor
        content={'007) parent\r\n     * child'}
        activeBlock={0}
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(editor.value).toBe('parent\n     * child')

    fireEvent.change(editor, {
      target: {
        value: 'changed\n     * child',
        selectionStart: 7,
        selectionEnd: 7,
      },
    })

    expect(onChange).toHaveBeenLastCalledWith('007) changed\r\n     * child')
  })

  it('deletes the selected first of two identical visible quote lines by input range', () => {
    const onChange = vi.fn()
    render(
      <LiveEditor
        content={'> a\n>> a'}
        activeBlock={0}
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 2)
    fireEvent.select(editor)
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteByCut',
    }))

    fireEvent.input(editor, {
      target: { value: 'a', selectionStart: 0, selectionEnd: 0 },
      inputType: 'deleteByCut',
    })

    expect(onChange).toHaveBeenLastCalledWith('>> a')
  })

  it('keeps canonical markers visible in source mode', () => {
    render(<ControlledEditor initial={'- item\r\n> quote'} sourceMode />)

    expect(
      (screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value,
    ).toBe('- item\n> quote')
  })

  it('activates quote styling as soon as a paragraph becomes a quote', () => {
    const result = render(<ControlledEditor initial="plain" />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: { value: '> quoted', selectionStart: 8, selectionEnd: 8 },
    })

    expect(editor.value).toBe('quoted')
    expect(
      editor.closest('.editor-block-row')?.classList.contains('is-active-quote'),
    ).toBe(true)
  })

  it('hides multiline nested quote markers and continues the current depth', () => {
    render(<ControlledEditor initial={'> one\r\n>> two'} />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(editor.value).toBe('one\ntwo')
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    fireEvent.change(editor, {
      target: { value: 'one\ntwo\nthree', selectionStart: 13, selectionEnd: 13 },
    })

    expect(editor.value).toBe('one\ntwo\nthree')
  })

  it('continues a quote with its exact marker depth and CRLF', () => {
    const onChange = vi.fn()
    render(
      <LiveEditor
        content={'>> nested\r\n>> second'}
        activeBlock={0}
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith('>> nested\r\n>> second\r\n>> ')
    expect(editor.value).toBe('nested\nsecond\n')
  })

  it('exits an empty quote line to plain paragraph mode', () => {
    render(<ControlledEditor initial="> " />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(editor.value).toBe('')

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('')
    expect(
      editor.closest('.editor-block-row')?.classList.contains('is-active-quote'),
    ).toBe(false)
  })

  it('maps visible selections for toolbar formatting without touching the marker', async () => {
    const onChange = vi.fn()
    const result = render(
      <LiveEditor
        content="- item"
        activeBlock={0}
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 4)
    result.rerender(
      <LiveEditor
        content="- item"
        activeBlock={0}
        formatRequest={{ id: 1, command: 'bold' }}
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('- **item**'))
  })

  it('preserves the hidden marker during IME and automatic spacing', () => {
    const onChange = vi.fn()
    render(
      <LiveEditor
        content="- 中文"
        activeBlock={0}
        autoSpacing
        onChange={onChange}
        onActiveBlockChange={vi.fn()}
      />,
    )
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    fireEvent.compositionStart(editor)
    fireEvent.change(editor, {
      target: { value: '中文text', selectionStart: 6, selectionEnd: 6 },
    })
    expect(onChange).toHaveBeenLastCalledWith('- 中文text')

    fireEvent.compositionEnd(editor, { data: 'text' })
    expect(onChange).toHaveBeenLastCalledWith('- 中文 text')
  })
})
