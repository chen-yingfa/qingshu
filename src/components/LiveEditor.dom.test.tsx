// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as markdown from '../markdown/markdown'
import { LiveEditor } from './LiveEditor'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderEditor(
  content: string,
  options: Partial<ComponentProps<typeof LiveEditor>> = {},
) {
  const onChange = vi.fn()
  const onActiveBlockChange = vi.fn()
  const result = render(
    <LiveEditor
      content={content}
      activeBlock={0}
      onChange={onChange}
      onActiveBlockChange={onActiveBlockChange}
      {...options}
    />,
  )
  return { ...result, onChange, onActiveBlockChange }
}

describe('LiveEditor state synchronization', () => {
  it('synchronizes the active draft after a same-index document replacement', () => {
    const result = renderEditor('Old document')

    result.rerender(
      <LiveEditor
        content="Opened document"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    const textarea = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(textarea.value).toBe('Opened document')
    fireEvent.change(textarea, { target: { value: 'Opened document!' } })
    expect(result.onChange).toHaveBeenLastCalledWith('Opened document!')
  })

  it('updates the active range when an earlier block changes length', () => {
    const result = renderEditor('中文text\n\nSecond', { activeBlock: 1 })

    result.rerender(
      <LiveEditor
        content={'中文 text\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Second!' },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('中文 text\n\nSecond!')
  })

  it('consumes acknowledgements before resynchronizing to an older emitted source', () => {
    const result = renderEditor('A')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement

    fireEvent.change(editor(), { target: { value: 'B' } })
    result.rerender(
      <LiveEditor
        content="B"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content="C"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content="B"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    expect(editor().value).toBe('B')
    fireEvent.change(editor(), { target: { value: 'B!' } })
    expect(result.onChange).toHaveBeenLastCalledWith('B!')
  })

  it('renders the entire source once while printing so cross-block footnotes resolve', async () => {
    renderEditor(
      '# Active\n\nA reference across blocks.[^note]\n\n[^note]: Footnote **content**.',
      { previewAll: true },
    )

    expect(screen.queryByLabelText('Active Markdown block')).toBeNull()
    expect(screen.queryByLabelText('Edit Markdown block')).toBeNull()
    const reference = await screen.findByRole('link', { name: '1' })
    expect(document.querySelectorAll('.rendered-block')).toHaveLength(1)
    expect(reference.getAttribute('href')).toBe(
      '#user-content-fn-cp-6e-6f-74-65',
    )
    expect(
      document.getElementById('user-content-fn-cp-6e-6f-74-65')?.textContent,
    ).toContain(
      'Footnote content',
    )
  })

  it('keeps rendered links interactive without button nesting', async () => {
    const result = renderEditor('Active\n\n[Link](https://example.com)')

    const link = await screen.findByRole('link', { name: 'Link' })
    expect(link.closest('[role="button"]')).toBeNull()
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link)
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
  })

  it('resolves cross-block reference links and appends one document footnote section', async () => {
    renderEditor(
      'Active\n\nRead [the guide][guide] and note this.[^tip]\n\n' +
        '[guide]: https://example.com/guide\n\n[^tip]: Shared **tip**.',
    )

    const guide = await screen.findByRole('link', { name: 'the guide' })
    const footnote = await screen.findByRole('link', { name: '1' })
    expect(guide.getAttribute('href')).toBe('https://example.com/guide')
    const footnoteTarget = '#user-content-fn-cp-74-69-70'
    expect(footnote.getAttribute('href')).toBe(footnoteTarget)
    expect(document.querySelectorAll('[data-footnotes]')).toHaveLength(1)
    expect(document.querySelector(footnoteTarget)?.textContent).toContain(
      'Shared tip',
    )
  })

  it('preserves an unchanged rendered block DOM node after a preceding edit', async () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const third = await screen.findByText('Third')
    const thirdBlock = third.closest('.preview-block')

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'A much longer first block' },
    })
    result.rerender(
      <LiveEditor
        content={'A much longer first block\n\nSecond\n\nThird'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await waitFor(() => expect(screen.getByText('Third').closest('.preview-block')).toBe(thirdBlock))
  })

  it('activates the current block index after insertion before a memoized block', async () => {
    const result = renderEditor('Active\n\nTarget')
    await screen.findByText('Target')

    result.rerender(
      <LiveEditor
        content={'Inserted\n\nActive\n\nTarget'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.click(await screen.findByText('Target'))

    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(2)
  })

  it('activates the current block index after removal before a memoized block', async () => {
    const result = renderEditor('Inserted\n\nActive\n\nTarget', { activeBlock: 1 })
    await screen.findByText('Target')

    result.rerender(
      <LiveEditor
        content={'Active\n\nTarget'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.click(await screen.findByText('Target'))

    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
  })

  it('derives blocks and render context with one document parse per source revision', () => {
    const parse = vi.spyOn(markdown, 'parseDocument')
    const result = renderEditor('First\n\nSecond')
    expect(parse).toHaveBeenCalledTimes(1)

    result.rerender(
      <LiveEditor
        content={'Changed\n\nSecond'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('bounds render work for a large document when only the active block changes', async () => {
    const renderBlock = vi.spyOn(markdown, 'renderMarkdownBlock')
    const content = Array.from({ length: 160 }, (_, index) => `Block ${index}`).join(
      '\n\n',
    )
    const result = renderEditor(content)
    await waitFor(() => expect(renderBlock).toHaveBeenCalledTimes(159))

    const changed = content.replace('Block 0', 'Changed active block zero')
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Changed active block zero' },
    })
    result.rerender(
      <LiveEditor
        content={changed}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(renderBlock).toHaveBeenCalledTimes(159)
  })
})

describe('LiveEditor keyboard and composition behavior', () => {
  it('shows a rendered KaTeX preview while editing inline and display math', async () => {
    const result = renderEditor(
      'Let $x_t \\in \\mathbb R$ and $$y_t=\\left(\\frac{q_tK_t^\\top}{\\sqrt d}\\right)VW_o^\\top$$',
    )

    const preview = await waitFor(() => {
      const element = result.container.querySelector('.active-live-preview')
      expect(element?.querySelectorAll('.katex')).toHaveLength(2)
      return element
    })
    expect(preview?.querySelector('.katex-html')).not.toBeNull()
  })

  it('shows a live preview for standard multiline display math', async () => {
    const result = renderEditor('$$\n\\left(\\frac{x_i}{\\mathbb R}\\right)\n$$')

    await waitFor(() => {
      expect(
        result.container.querySelector('.active-math-preview .katex-display'),
      ).not.toBeNull()
    })
  })

  it('hides a stale math preview immediately when the source is no longer math', async () => {
    const result = renderEditor('$x_t$')
    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )

    result.rerender(
      <LiveEditor
        content="plain text"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(result.container.querySelector('.active-math-preview')).toBeNull()
  })

  it('enters fenced code mode with a highlighted live preview', async () => {
    const result = renderEditor('```ts\nconst total = value + 1\n```')

    const editor = screen.getByLabelText('Active code block')
    expect(editor.classList.contains('source-block-code')).toBe(true)
    await waitFor(() => {
      expect(result.container.querySelector('.active-code-preview .hljs-keyword')).not.toBeNull()
    })
    expect(result.container.querySelector('.active-code-preview')?.textContent).toContain(
      'const total = value + 1',
    )
  })

  it('creates and indents a fenced code body from an opening fence', async () => {
    const result = renderEditor('```ts')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('```ts\n\n```')
    expect(editor.value).toBe('```ts\n\n```')
    await waitFor(() => expect(editor.selectionStart).toBe('```ts\n'.length))
  })

  it('supports Tab and indentation-preserving Enter in fenced code mode', async () => {
    const result = renderEditor('```ts\n  const value = 1\n```')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    const lineEnd = editor.value.indexOf('\n```')
    editor.setSelectionRange(lineEnd, lineEnd)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '```ts\n  const value = 1\n  \n```',
    )

    await waitFor(() =>
      expect(editor.selectionStart).toBe('```ts\n  const value = 1\n  '.length),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '```ts\n  const value = 1\n    \n```',
    )
  })

  it('supports CRLF fenced code without changing the source line endings', async () => {
    const result = renderEditor('```ts\r\nconst value = 1\r\n```')
    const editor = screen.getByLabelText('Active code block')

    await waitFor(() => {
      expect(result.container.querySelector('.active-code-preview .hljs-keyword')).not.toBeNull()
    })
    const textarea = editor as HTMLTextAreaElement
    const lineEnd = textarea.value.indexOf('\n```')
    textarea.setSelectionRange(lineEnd, lineEnd)
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '```ts\r\nconst value = 1\r\n\r\n```',
    )
    expect(result.container.querySelector('.preview-label')?.textContent).toContain(
      'typescript',
    )
  })

  it('outdents with Shift+Tab and lets Tab leave code mode after Escape', () => {
    const result = renderEditor('```ts\n    value\n```')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    const valueStart = editor.value.indexOf('value')
    editor.setSelectionRange(valueStart, valueStart)

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith('```ts\n  value\n```')

    fireEvent.keyDown(editor, { key: 'Escape' })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('resets the code Tab escape after blur', () => {
    renderEditor('```ts\nvalue\n```')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.blur(editor)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
  })

  it('inserts an editable block between blocks when Enter is pressed at the end', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('First\n\n\n\nSecond')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect((screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value).toBe(
      '',
    )
  })

  it('inserts and focuses a new block before the current block on leading Enter', () => {
    const result = renderEditor('First\n\nSecond', { activeBlock: 1 })
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith('First\n\n\n\nSecond')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('')

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Inserted before' },
    })
    expect(result.onChange).toHaveBeenLastCalledWith(
      'First\n\nInserted before\n\nSecond',
    )
  })

  it('inserts a focused block before the first document block', () => {
    const result = renderEditor('Current')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith('\n\nCurrent')
    result.rerender(
      <LiveEditor
        content={'\n\nCurrent'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'New first' },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('New first\n\nCurrent')
  })

  it('removes a still-empty block inserted before current content', () => {
    const result = renderEditor('First\n\nSecond', { activeBlock: 1 })
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)
    fireEvent.keyDown(editor, { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'Backspace',
    })
    expect(result.onChange).toHaveBeenLastCalledWith('First\n\nSecond')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('removes an empty block inserted before the first block', () => {
    const result = renderEditor('Current')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(0, 0)
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'\n\nCurrent'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.keyDown(editor(), { key: 'Backspace' })
    expect(result.onChange).toHaveBeenLastCalledWith('Current')
    expect(editor().value).toBe('Current')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('does not intercept Backspace for a non-empty selection at block start', () => {
    renderEditor('First\n\nSecond', { activeBlock: 1 })
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, editor.value.length)
    const backspace = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })

    editor.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(false)
  })

  it('leaves modified Enter shortcuts untouched at block start', () => {
    renderEditor('Current')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    editor.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
  })

  it('inserts a block after a heading separated from content by one newline', () => {
    const result = renderEditor('# Heading\nParagraph')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith('# Heading\n\n\nParagraph')
    result.rerender(
      <LiveEditor
        content={'# Heading\n\n\nParagraph'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: 'Inserted' },
    })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '# Heading\nInserted\n\nParagraph',
    )
  })

  it('does not invent an editable paragraph inside three natural paragraph newlines', () => {
    renderEditor('First\n\n\nSecond', { activeBlock: 1 })
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('Second')
  })

  it('keeps whitespace and restores an inserted block after deleting its text', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })

    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: '  ' } })
    const whitespaceSource = 'First\n\n  \n\nSecond'
    result.rerender(
      <LiveEditor
        content={whitespaceSource}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(editor().value).toBe('  ')

    fireEvent.change(editor(), { target: { value: 'Inserted' } })
    const insertedSource = 'First\n\nInserted\n\nSecond'
    result.rerender(
      <LiveEditor
        content={insertedSource}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: '' } })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(editor().value).toBe('')
  })

  it('does not duplicate a trailing inserted block containing whitespace', () => {
    const result = renderEditor('First')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: '  ' } })
    result.rerender(
      <LiveEditor
        content={'First\n\n  '}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    expect(result.container.querySelector('[data-block-id="empty-tail-7"]')).toBeNull()
    expect(editor().value).toBe('  ')
  })

  it('removes an inserted block padding when Backspace merges it', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.keyDown(editor(), { key: 'Backspace' })
    expect(result.onChange).toHaveBeenLastCalledWith('First\n\nSecond')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('removes tracked whitespace with its inserted block on Backspace', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: '  ' } })
    result.rerender(
      <LiveEditor
        content={'First\n\n  \n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    editor().setSelectionRange(0, 0)

    fireEvent.keyDown(editor(), { key: 'Backspace' })
    expect(result.onChange).toHaveBeenLastCalledWith('First\n\nSecond')
  })

  it('uses normal merge semantics when Backspace joins a typed inserted block', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = () =>
      screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: 'Inserted' } })
    result.rerender(
      <LiveEditor
        content={'First\n\nInserted\n\nSecond'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    editor().setSelectionRange(0, 0)

    fireEvent.keyDown(editor(), { key: 'Backspace' })
    expect(result.onChange).toHaveBeenLastCalledWith('First\nInserted\n\nSecond')
  })

  it('clears inserted block state on an external document replacement', () => {
    const result = renderEditor('First\n\nSecond')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    result.rerender(
      <LiveEditor
        content={'External\n\nDocument'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('Document')
  })

  it('inserts a CRLF block after a closed fence without mixing line endings', () => {
    const result = renderEditor('```\r\ncode\r\n```\r\nAfter')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '```\r\ncode\r\n```\r\n\r\n\r\nAfter',
    )
  })

  it('preserves unchanged mixed line endings while editing code', () => {
    const result = renderEditor('```ts\r\nfirst\nsecond\r\n```\nAfter')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    const second = editor.value.indexOf('second')
    editor.setSelectionRange(second + 'second'.length, second + 'second'.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '```ts\r\nfirst\nsecond\r\n\r\n```\nAfter',
    )
  })

  it('preserves mixed line endings when formatting a multiline selection', async () => {
    const result = renderEditor('one\r\ntwo\nthree')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, editor.value.length)
    result.rerender(
      <LiveEditor
        content={'one\r\ntwo\nthree'}
        activeBlock={0}
        formatRequest={{ id: 1, command: 'bold' }}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await waitFor(() =>
      expect(result.onChange).toHaveBeenLastCalledWith(
        '**one\r\ntwo\nthree**',
      ),
    )
  })

  it('uses the local line ending when Backspace merges mixed-EOL blocks', () => {
    const result = renderEditor('First\r\n\r\nMiddle\n\nLast', {
      activeBlock: 2,
    })
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)

    fireEvent.keyDown(editor, { key: 'Backspace' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      'First\r\n\r\nMiddle\nLast',
    )
  })

  it('keeps repeated trailing blocks editable when typing fenced code', () => {
    const result = renderEditor('First')
    const editor = () =>
      screen.getByLabelText(/Active (?:Markdown|code) block/) as HTMLTextAreaElement
    editor().setSelectionRange(editor().value.length, editor().value.length)
    fireEvent.keyDown(editor(), { key: 'Enter' })

    result.rerender(
      <LiveEditor
        content={'First\n\n'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.keyDown(editor(), { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\n'}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.change(editor(), { target: { value: '```ts' } })

    expect(result.onChange).toHaveBeenLastCalledWith('First\n\n\n\n```ts')
    expect(editor().value).toBe('```ts')
    expect(editor().getAttribute('aria-label')).toBe('Active code block')
  })

  it('applies automatic spacing after IME composition completes', async () => {
    const result = renderEditor('中文', { autoSpacing: true })
    const textarea = screen.getByLabelText('Active Markdown block')

    fireEvent.compositionStart(textarea)
    fireEvent.change(textarea, { target: { value: '中文text' } })
    expect(result.onChange).toHaveBeenLastCalledWith('中文text')
    fireEvent.compositionEnd(textarea, { data: 'text' })

    expect(result.onChange).toHaveBeenLastCalledWith('中文 text')
    expect((textarea as HTMLTextAreaElement).value).toBe('中文 text')
    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).selectionStart).toBe(7),
    )
  })

  it('extends selection for Ctrl+Shift+Arrow CJK movement', () => {
    renderEditor('今天 writing')
    const textarea = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 0)

    fireEvent.keyDown(textarea, {
      key: 'ArrowRight',
      ctrlKey: true,
      shiftKey: true,
    })

    expect(textarea.selectionStart).toBe(0)
    expect(textarea.selectionEnd).toBe(2)
  })

  it.each([
    {
      name: 'Marp',
      source: [
        '---',
        'marp: true',
        'theme: 中文Theme',
        'title: "中文A"',
        '---',
        '<!-- _class: 中文Lead -->',
        '',
        '# 正文React19',
      ].join('\n'),
      marker: 'title:',
    },
    {
      name: 'Slidev',
      source: [
        '---',
        'layout: 中文Layout',
        'theme: 中文Theme',
        'title: "中文A"',
        '---',
        '::right::',
        '<Tweet id="中文A" />',
        '',
        '正文Vue3',
      ].join('\n'),
      marker: 'layout:',
    },
  ])('protects full-document $name metadata while its parsed block is active', ({
    source,
    marker,
  }) => {
    const activeBlock = markdown
      .parseDocument(source)
      .blocks.findIndex((block) => block.source.includes(marker))
    const result = renderEditor(source, { activeBlock, autoSpacing: true })

    fireEvent.blur(screen.getByLabelText('Active Markdown block'))

    expect(result.onChange).not.toHaveBeenCalled()
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toContain('"中文A"')
  })
})
