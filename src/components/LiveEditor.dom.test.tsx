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
      contentRevision={options.contentRevision ?? 0}
      activeBlock={0}
      onChange={onChange}
      onActiveBlockChange={onActiveBlockChange}
      {...options}
    />,
  )
  return { ...result, onChange, onActiveBlockChange }
}

describe('LiveEditor state synchronization', () => {
  it('preserves the active textarea and caret after each parent content update', () => {
    const result = renderEditor('Hello')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(3, 3)

    fireEvent.change(editor, {
      target: {
        value: 'HelXlo',
        selectionStart: 4,
        selectionEnd: 4,
      },
    })
    result.rerender(
      <LiveEditor
        content="HelXlo"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    const synchronized = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(synchronized).toBe(editor)
    expect(synchronized.selectionStart).toBe(4)
    expect(synchronized.selectionEnd).toBe(4)
  })

  it('keeps focus when a block after a list becomes an empty list item', () => {
    const result = renderEditor('- Previous item\n\nCurrent', {
      activeBlock: 1,
    })
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(0, editor.value.length)

    fireEvent.change(editor, {
      target: { value: '-', selectionStart: 1, selectionEnd: 1 },
    })
    result.rerender(
      <LiveEditor
        content={'- Previous item\n\n-'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    const current = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(current).toBe(editor)
    expect(current.value).toBe('-')
    expect(current.selectionStart).toBe(1)
    expect(screen.getByRole('button', { name: 'Move block 1' })).not.toBeNull()
  })

  it('restores the full semantic list when switching to its preceding item', async () => {
    const result = renderEditor('- Previous item  \n\nCurrent', {
      activeBlock: 1,
    })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '-', selectionStart: 1, selectionEnd: 1 },
    })
    result.rerender(
      <LiveEditor
        content={'- Previous item  \n\n-'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    result.rerender(
      <LiveEditor
        content={'- Previous item  \n\n-'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
          .value,
      ).toBe('- Previous item  \n\n-'),
    )
  })

  it('remaps a trailing list overlay to its semantic list index', async () => {
    const before =
      'Intro\n\n- One\n\nCurrent\n\n- Three\n\nOutro\n\nAnother'
    const after = 'Intro\n\n- One\n\n-\n\n- Three\n\nOutro\n\nAnother'
    const result = renderEditor(before, { activeBlock: 2 })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '-', selectionStart: 1, selectionEnd: 1 },
    })
    result.rerender(
      <LiveEditor
        content={after}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    result.rerender(
      <LiveEditor
        content={after}
        activeBlock={3}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() =>
      expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1),
    )
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('- One\n\n-\n\n- Three')
  })

  it('includes explicit empty rows when remapping a collapsed list index', async () => {
    const before = 'Intro\n\n- One\n\nCurrent\n\n- Three\n\nOutro'
    const withEmpty = 'Intro\n\n\n\n- One\n\nCurrent\n\n- Three\n\nOutro'
    const after = 'Intro\n\n\n\n- One\n\n-\n\n- Three\n\nOutro'
    const result = renderEditor(before)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={withEmpty}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content={withEmpty}
        activeBlock={3}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '-', selectionStart: 1, selectionEnd: 1 },
    })
    result.rerender(
      <LiveEditor
        content={after}
        activeBlock={3}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    result.rerender(
      <LiveEditor
        content={after}
        activeBlock={4}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() =>
      expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(2),
    )
  })

  it('does not duplicate content when a tight list becomes loose while active', () => {
    const result = renderEditor('- First\n- Second')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: {
        value: '- First\n\n- Second',
        selectionStart: 9,
        selectionEnd: 9,
      },
    })
    result.rerender(
      <LiveEditor
        content={'- First\n\n- Second'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    expect(screen.getAllByLabelText('Active Markdown block')).toHaveLength(1)
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('- First\n\n- Second')
    expect(result.container.querySelectorAll('.rendered-block')).toHaveLength(0)
  })

  it('synchronizes the active draft after a same-index document replacement', () => {
    const result = renderEditor('Old document')
    const previous = screen.getByLabelText('Active Markdown block')

    result.rerender(
      <LiveEditor
        content="Opened document"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    const textarea = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    expect(textarea).not.toBe(previous)
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

  it('resets IME composition state for a same-index external replacement', () => {
    const result = renderEditor('中文', { autoSpacing: true })
    fireEvent.compositionStart(screen.getByLabelText('Active Markdown block'))
    result.rerender(
      <LiveEditor
        content="新文"
        activeBlock={0}
        autoSpacing
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '新文text', selectionStart: 6, selectionEnd: 6 },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('新文 text')
  })

  it('resets code Tab escape state when a new block session replaces it', () => {
    const result = renderEditor('```ts\nvalue\n```')
    fireEvent.keyDown(screen.getByLabelText('Active code block'), {
      key: 'Escape',
    })
    result.rerender(
      <LiveEditor
        content={'```js\nother\n```'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)

    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith('  ```js\nother\n```')
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

  it('inserts before a CRLF fenced-code block without mixing line endings', () => {
    const result = renderEditor('```ts\r\nconst value = 1\r\n```')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    editor.setSelectionRange(0, 0)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '\r\n\r\n```ts\r\nconst value = 1\r\n```',
    )
    result.rerender(
      <LiveEditor
        content={'\r\n\r\n```ts\r\nconst value = 1\r\n```'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement).value,
    ).toBe('')
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
    result.rerender(
      <LiveEditor
        content="Current"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(editor().value).toBe('Current')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
    fireEvent.change(editor(), { target: { value: 'Current!' } })
    expect(result.onChange).toHaveBeenLastCalledWith('Current!')
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

  it('leaves modified Enter untouched at block end and inside code', () => {
    const plain = renderEditor('Current')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    const endEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    editor.dispatchEvent(endEnter)
    expect(endEnter.defaultPrevented).toBe(false)
    plain.unmount()

    renderEditor('```ts\nvalue\n```')
    const code = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    code.setSelectionRange(code.value.indexOf('value'), code.value.indexOf('value'))
    const codeEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    code.dispatchEvent(codeEnter)
    expect(codeEnter.defaultPrevented).toBe(false)
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

describe('LiveEditor block reordering', () => {
  it('shows a blue drop boundary and moves a dragged block there', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const handle = screen.getByRole('button', { name: 'Move block 2' })
    const target = result.container.querySelector(
      '[data-drop-boundary="0"]',
    ) as HTMLElement

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, isPrimary: true })
    fireEvent.pointerEnter(target, { pointerId: 1 })
    expect(target.classList.contains('is-drop-target')).toBe(true)
    fireEvent.pointerUp(target, { pointerId: 1 })

    expect(result.onChange).toHaveBeenLastCalledWith(
      'Second\n\nFirst\n\nThird',
    )
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('moves blocks with Alt+Arrow from the drag handle', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 1' }), {
      key: 'ArrowDown',
      altKey: true,
    })

    expect(result.onChange).toHaveBeenLastCalledWith(
      'Second\n\nFirst\n\nThird',
    )
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
  })

  it('retains drag-handle focus for repeated keyboard moves', async () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 1' }), {
      key: 'ArrowDown',
      altKey: true,
    })
    result.rerender(
      <LiveEditor
        content={'Second\n\nFirst\n\nThird'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Move block 2',
      ),
    )

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
      altKey: true,
    })
    expect(result.onChange).toHaveBeenLastCalledWith(
      'Second\n\nThird\n\nFirst',
    )
  })

  it('commits the hovered move when pointer release misses the drop zone', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const handle = screen.getByRole('button', { name: 'Move block 3' })
    const target = result.container.querySelector(
      '[data-drop-boundary="0"]',
    ) as HTMLElement

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, isPrimary: true })
    fireEvent.pointerEnter(target, { pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })

    expect(result.onChange).toHaveBeenLastCalledWith(
      'Third\n\nFirst\n\nSecond',
    )
  })

  it('cancels rather than corrupting source changed during a drag', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const handle = screen.getByRole('button', { name: 'Move block 2' })
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
    })
    result.rerender(
      <LiveEditor
        content={'First changed\n\nSecond\n\nThird'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(result.onChange).not.toHaveBeenCalled()
  })

  it('ignores unrelated pointer releases during a drag', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const handle = screen.getByRole('button', { name: 'Move block 2' })
    const target = result.container.querySelector(
      '[data-drop-boundary="0"]',
    ) as HTMLElement
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
    })
    fireEvent.pointerEnter(target, { pointerId: 1 })

    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(result.onChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(result.onChange).toHaveBeenCalledOnce()
  })

  it('rejects a competing primary pointer during an active drag', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const target = result.container.querySelector(
      '[data-drop-boundary="0"]',
    ) as HTMLElement
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Move block 2' }),
      { pointerId: 1, button: 0, isPrimary: true },
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Move block 3' }),
      { pointerId: 2, button: 0, isPrimary: true },
    )
    fireEvent.pointerEnter(target, { pointerId: 2 })
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(result.onChange).not.toHaveBeenCalled()

    fireEvent.pointerEnter(target, { pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(result.onChange).toHaveBeenLastCalledWith(
      'Second\n\nFirst\n\nThird',
    )
  })

  it('tracks touch movement by coordinates despite implicit pointer capture', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const zones = Array.from(
      result.container.querySelectorAll<HTMLElement>('.block-drop-zone'),
    )
    zones.forEach((zone, index) => {
      vi.spyOn(zone, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: index * 100,
        top: index * 100,
        right: 500,
        bottom: index * 100 + 20,
        left: 0,
        width: 500,
        height: 20,
        toJSON: () => ({}),
      })
    })
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Move block 3' }),
      {
        pointerId: 7,
        pointerType: 'touch',
        button: 0,
        isPrimary: true,
      },
    )

    fireEvent.pointerMove(window, { pointerId: 7, clientY: 5 })
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(result.onChange).toHaveBeenLastCalledWith(
      'Third\n\nFirst\n\nSecond',
    )
  })

  it('keeps front matter locked and exposes handles only for content blocks', () => {
    renderEditor(
      [
        '---',
        'title: Drag test',
        'theme: default',
        '---',
        '# First',
        '',
        'Second',
      ].join('\n'),
      { activeBlock: 2 },
    )

    expect(screen.queryByRole('button', { name: 'Move block 3' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Move block 1' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Move block 2' })).not.toBeNull()
  })

  it('keeps the moved block active across an interior synthetic block', () => {
    const result = renderEditor('First\n\nSecond\n\nThird')
    const editor = screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'First\n\n\n\nSecond\n\nThird'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move block 1' }), {
      pointerId: 11,
      button: 0,
      isPrimary: true,
    })
    fireEvent.pointerEnter(
      result.container.querySelector('[data-drop-boundary="3"]') as HTMLElement,
      { pointerId: 11 },
    )
    fireEvent.pointerUp(window, { pointerId: 11 })

    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(3)
  })

  it('recalculates deletion padding when a typed inserted block moves first', () => {
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

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 2' }), {
      key: 'ArrowUp',
      altKey: true,
    })
    result.rerender(
      <LiveEditor
        content={'Inserted\n\nFirst\n\nSecond'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.change(editor(), { target: { value: '' } })
    result.rerender(
      <LiveEditor
        content={'\n\nFirst\n\nSecond'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.keyDown(editor(), { key: 'Backspace' })

    expect(result.onChange).toHaveBeenLastCalledWith('First\n\nSecond')
  })
})

describe('LiveEditor source mode', () => {
  it('preserves CRLF line endings while editing normalized textarea content', () => {
    const result = renderEditor('first\r\nsecond', {
      sourceMode: true,
      contentRevision: 0,
    })
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    expect(source.value).toBe('first\nsecond')

    fireEvent.change(source, {
      target: {
        value: 'first\nsecond!',
        selectionStart: 13,
        selectionEnd: 13,
      },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('first\r\nsecond!')
  })

  it('does not overwrite rapid local edits with intermediate acknowledgements', () => {
    const result = renderEditor('abc', { sourceMode: true })
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    source.setSelectionRange(3, 3)
    fireEvent.change(source, {
      target: { value: 'abcX', selectionStart: 4, selectionEnd: 4 },
    })
    fireEvent.change(source, {
      target: { value: 'abcXY', selectionStart: 5, selectionEnd: 5 },
    })

    result.rerender(
      <LiveEditor
        content="abcX"
        contentRevision={1}
        activeBlock={0}
        sourceMode
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(source.value).toBe('abcXY')
    expect(source.selectionStart).toBe(5)

    result.rerender(
      <LiveEditor
        content="abcXY"
        contentRevision={2}
        activeBlock={0}
        sourceMode
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(source.value).toBe('abcXY')
    expect(source.selectionStart).toBe(5)
  })

  it('ignores delayed revisions after a newer external replacement', () => {
    const result = renderEditor('base', {
      sourceMode: true,
      contentRevision: 0,
    })
    const source = screen.getByLabelText('Markdown source')
    fireEvent.change(source, { target: { value: 'local one' } })
    fireEvent.change(source, { target: { value: 'local two' } })
    result.rerender(
      <LiveEditor
        content="local one"
        contentRevision={1}
        activeBlock={0}
        sourceMode
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content="external"
        contentRevision={3}
        activeBlock={0}
        sourceMode
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content="local two"
        contentRevision={2}
        activeBlock={0}
        sourceMode
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    expect((source as HTMLTextAreaElement).value).toBe('external')
  })

  it('edits the canonical document directly and supports Tab indentation', async () => {
    const result = renderEditor('# Title\n\nBody', { sourceMode: true })
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    source.setSelectionRange(source.value.length, source.value.length)

    fireEvent.keyDown(source, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith('# Title\n\nBody  ')
    await waitFor(() =>
      expect(source.selectionStart).toBe('# Title\n\nBody  '.length),
    )
  })

  it('applies line-prefix formatting from a mid-line caret without duplication', async () => {
    const result = renderEditor('abc', { sourceMode: true })
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    source.setSelectionRange(2, 2)
    result.rerender(
      <LiveEditor
        content="abc"
        contentRevision={0}
        activeBlock={0}
        sourceMode
        formatRequest={{ id: 1, command: 'heading' }}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await waitFor(() =>
      expect(result.onChange).toHaveBeenLastCalledWith('# abc'),
    )
    expect(source.value).toBe('# abc')
  })

  it('uses rendered full-document preview instead of source while printing', async () => {
    renderEditor('# Printed', { sourceMode: true, previewAll: true })

    expect(screen.queryByLabelText('Markdown source')).toBeNull()
    expect(await screen.findByText('Printed')).not.toBeNull()
  })

  it('does not render preview footnotes beneath source mode', () => {
    const result = renderEditor('Text[^1]\n\n[^1]: Note', {
      sourceMode: true,
    })

    expect(result.container.querySelector('[data-footnotes]')).toBeNull()
    expect(result.container.querySelectorAll('.rendered-block')).toHaveLength(0)
  })
})
