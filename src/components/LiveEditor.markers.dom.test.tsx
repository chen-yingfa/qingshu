// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveEditor } from './LiveEditor'

afterEach(cleanup)

function ControlledEditor({
  initial,
  sourceMode = false,
  onChangeSpy,
}: {
  initial: string
  sourceMode?: boolean
  onChangeSpy?: (content: string) => void
}) {
  const [content, setContent] = useState(initial)
  const [activeBlock, setActiveBlock] = useState(0)
  return (
    <LiveEditor
      content={content}
      contentRevision={0}
      activeBlock={activeBlock}
      sourceMode={sourceMode}
      onChange={(nextContent) => {
        onChangeSpy?.(nextContent)
        setContent(nextContent)
      }}
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

  it.each([
    ['1. [x] done', true],
    ['1) [X] done', true],
    ['1. [ ] pending', false],
  ])('renders the active ordered task check state for %s', (source, checked) => {
    render(<ControlledEditor initial={source} />)

    expect(
      (screen.getByRole('checkbox', {
        name: source.includes('pending') ? 'pending' : 'done',
      }) as HTMLInputElement).checked,
    ).toBe(checked)
  })

  it.each([
    ['3) first\n4) second', ['3)', '4)']],
    ['007. first\n008. second', ['007.', '008.']],
  ])('renders exact ordered source markers in active and inactive rows', (
    source,
    markers,
  ) => {
    const result = render(<ControlledEditor initial={source} />)

    expect(
      Array.from(result.container.querySelectorAll('.ordered-list-marker')).map(
        (marker) => marker.textContent,
      ),
    ).toEqual(markers)
    expect(result.container.querySelectorAll('ol.semantic-list-group')).toHaveLength(1)
    expect(
      Array.from(result.container.querySelectorAll('ol > li')).map((item) =>
        item.getAttribute('value'),
      ),
    ).toEqual(markers.map((marker) => String(Number.parseInt(marker, 10))))
  })

  it('uses checkboxes without duplicate numeric markers for ordered tasks', async () => {
    const result = render(<ControlledEditor initial={'1. [x] done\n2. [ ] pending'} />)

    await waitFor(() =>
      expect(result.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2),
    )
    expect(result.container.querySelectorAll('.ordered-list-marker')).toHaveLength(0)
    expect(result.container.querySelector('ol')?.getAttribute('start')).toBe('1')
    expect(result.container.querySelectorAll('ol > li')).toHaveLength(2)
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

  it('exits an empty quote line to plain paragraph mode', async () => {
    render(<ControlledEditor initial="> " />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(editor.value).toBe('')

    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      const paragraph = screen.getByLabelText('Active Markdown block')
      expect((paragraph as HTMLTextAreaElement).value).toBe('')
      expect(
        paragraph.closest('.editor-block-row')?.classList.contains('is-active-quote'),
      ).toBe(false)
    })
  })

  it.each([
    ['first', '> \n>> two', '\n\n>> two'],
    ['middle', '>> one\n>> \n>> two', '>> one\n\n\n\n>> two'],
    ['last CRLF', '> one\r\n> ', '> one\r\n\r\n'],
  ])('exits an empty quote in the %s position through a real paragraph boundary', async (
    _position,
    source,
    expected,
  ) => {
    const onChange = vi.fn()
    render(<ControlledEditor initial={source} onChangeSpy={onChange} />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    const emptyLine = editor.value
      .split('\n')
      .slice(0, editor.value.split('\n').findIndex((line) => line === ''))
      .reduce((offset, line) => offset + line.length + 1, 0)
    editor.setSelectionRange(emptyLine, emptyLine)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith(expected)
    await waitFor(() => {
      const paragraph = screen.getByLabelText('Active Markdown block')
      expect((paragraph as HTMLTextAreaElement).value).toBe('')
      expect(document.activeElement).toBe(paragraph)
      expect(
        paragraph.closest('.editor-block-row')?.classList.contains('is-active-quote'),
      ).toBe(false)
    })
  })

  it('continues a quote once and exits it on the immediately empty quote Enter', async () => {
    const onChange = vi.fn()
    render(<ControlledEditor initial="> one" onChangeSpy={onChange} />)
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('> one\n> ')
    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith('> one\n\n')
    await waitFor(() =>
      expect((screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value).toBe(''),
    )
    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'z',
      ctrlKey: true,
    })
    expect(onChange).toHaveBeenLastCalledWith('> one\n> ')
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
