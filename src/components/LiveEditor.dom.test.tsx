// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as markdown from '../markdown/markdown'
import * as markdownCjk from '../markdown/cjk'
import * as markdownParser from '../markdown/parser'
import { loadSettings } from '../settings'
import { LiveEditor } from './LiveEditor'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
  it('renders adjacent list-item blocks as one visual group with semantic numbering', async () => {
    const source = '1. first\n1. second\n\n- [x] done\n- [ ] pending\n\nAfter'
    const result = renderEditor(source, { activeBlock: 4 })

    await waitFor(() => {
      const lists = result.container.querySelectorAll(
        '.editor-block-row[data-list-group]',
      )
      expect(lists).toHaveLength(4)
      expect(lists[0].getAttribute('data-list-group')).toBe(
        lists[1].getAttribute('data-list-group'),
      )
      expect(lists[2].getAttribute('data-list-group')).toBe(
        lists[3].getAttribute('data-list-group'),
      )
    })
    expect(
      Array.from(result.container.querySelectorAll('ol'), (list) =>
        list.getAttribute('start'),
      ),
    ).toEqual(['1', '2'])
    expect(result.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
  })

  it('continues a top-level list into a newly focused item block', async () => {
    const result = renderEditor('- first')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('- first\n- ')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    await waitFor(() => {
      expect(editor.value).toBe('- ')
      expect(document.activeElement).toBe(editor)
    })
    result.rerender(
      <LiveEditor
        content={'- first\n- '}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() => {
      const next = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      expect(next.value).toBe('- ')
      expect(document.activeElement).toBe(next)
    })
  })

  it('shows frontmatter as one protected metadata block', async () => {
    const source = '---\ntitle: Test\ntags: [notes]\n---\n\n# Heading'
    const result = renderEditor(source, { activeBlock: 1 })

    const label = await screen.findByText('YAML front matter')
    expect(label.closest('.frontmatter-preview')?.textContent).toContain(
      'title: Test',
    )
    expect(
      label.closest('.editor-block-row')?.querySelector('.block-drag-handle'),
    ).toBeNull()
    expect(result.container.querySelectorAll('.frontmatter-preview')).toHaveLength(
      1,
    )
    expect(
      screen.getByRole('button', { name: 'Edit YAML front matter' }),
    ).not.toBeNull()
  })

  it('labels the active YAML frontmatter editor distinctly', () => {
    renderEditor('---\ntitle: Test\n---\n\nBody')

    expect(screen.getByLabelText('Active YAML front matter block')).not.toBeNull()
  })

  it('preserves BOM and CRLF while editing frontmatter', () => {
    const source = '\uFEFF---\r\ntitle: Old\r\n---\r\n\r\nBody'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active YAML front matter block',
    ) as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: {
        value: '\uFEFF---\ntitle: New\n---',
        selectionStart: 20,
        selectionEnd: 20,
      },
    })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '\uFEFF---\r\ntitle: New\r\n---\r\n\r\nBody',
    )
  })

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
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
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
      expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1),
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
    expect(result.container.querySelectorAll('.rendered-block')).toHaveLength(1)
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

  it('retains the last good block HTML and displays a render failure', async () => {
    const original = markdown.renderMarkdownBlock
    const result = renderEditor(
      'Active\n\nPreviously rendered [link][ref]\n\n[ref]: https://example.com/old',
    )
    expect(await screen.findByText('Previously rendered')).not.toBeNull()
    vi.spyOn(markdown, 'renderMarkdownBlock').mockImplementation(
      (block, context) =>
        block.source.includes('Previously rendered')
          ? Promise.reject(new Error('renderer exploded'))
          : original(block, context),
    )

    result.rerender(
      <LiveEditor
        content={
          'Active\n\nPreviously rendered [link][ref]\n\n[ref]: https://example.com/new'
        }
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Unable to render this block: renderer exploded',
    )
    expect(screen.getByText('Previously rendered')).not.toBeNull()
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
  it('continues unordered lists and exits after an empty item', async () => {
    const result = renderEditor('- first')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith('- first\n- ')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    await waitFor(() => expect(editor.selectionStart).toBe(2))

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith('- first\n\n')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('increments ordered list markers including parenthesis style', async () => {
    const result = renderEditor('3) first')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('3) first\n4) ')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    await waitFor(() => expect(editor.selectionStart).toBe('4) '.length))
  })

  it.each([
    ['* item', '* item\n* '],
    ['+ item', '+ item\n+ '],
    ['9. item', '9. item\n10. '],
    ['  1. nested', '  1. nested\n  2. '],
    ['- [x] done', '- [x] done\n- [ ] '],
  ])('continues list style for %s', (source, expected) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it('splits a list item at the caret without duplicating separator spaces', () => {
    const result = renderEditor('- first second')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(7, 7)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '- first\n- second',
    )
  })

  it('turns a lone empty list marker into an explicit paragraph', async () => {
    const onEphemeralStateChange = vi.fn()
    const result = renderEditor('- ', { onEphemeralStateChange })
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, 2)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
    await waitFor(() => {
      expect(
        onEphemeralStateChange.mock.calls.at(-1)?.[0].insertedBlocks,
      ).toEqual({
        content: '',
        blocks: [{
          offset: 0,
          length: 0,
          leftPadding: 0,
          rightPadding: 0,
        }],
      })
    })
  })

  it('splits a list around an empty middle item and focuses a paragraph', () => {
    const result = renderEditor('- first\n- \n- third')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(10, 10)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '- first\n\n\n\n- third',
    )
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    result.rerender(
      <LiveEditor
        content={'- first\n\n\n\n- third'}
        contentRevision={1}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('')
  })

  it('indents and outdents the current list item with Tab', async () => {
    const result = renderEditor('- parent\n- nested')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length - 6, editor.value.length - 6)

    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith('- parent\n  - nested')
    await waitFor(() => expect(editor.selectionStart).toBe(13))

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith('- parent\n- nested')
  })

  it('does not indent the first list item into indented code', () => {
    const result = renderEditor('- first')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, 2)
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
  })

  it.each([
    ['two-space', '- parent\n  - existing\n- next', '  ', '- parent\n  - existing\n  - next'],
    ['tab', '- parent\n\t- existing\n- next', '\t', '- parent\n\t- existing\n\t- next'],
  ])('uses an existing %s nesting style', (
    _name,
    source,
    _indent,
    expected,
  ) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      source.lastIndexOf('- next') + 2,
      source.lastIndexOf('- next') + 2,
    )

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it('removes an empty list marker with Backspace', () => {
    const result = renderEditor('1. ')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(3, 3)

    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(result.onChange).toHaveBeenLastCalledWith('')
  })

  it.each([
    ['indented code', '    - code', 'Active Markdown block', 6],
    ['YAML front matter', '---\n- metadata\n---', 'Active YAML front matter block', 12],
    ['TOML front matter', '+++\n- metadata\n+++', 'Active TOML front matter block', 12],
    ['display math', '$$\n- equation\n$$', 'Active math block', 13],
    ['HTML metadata', '<section>\n- metadata\n</section>', 'Active Markdown block', 20],
    ['presentation directive', '::right::\n3. not-a-list', 'Active Markdown block', 23],
    ['ordinary paragraph', 'Paragraph\n3. not-a-list', 'Active Markdown block', 23],
  ])(
    'does not intercept marker-shaped lines in %s',
    (_name, source, label, caret) => {
      const result = renderEditor(source)
      const editor = screen.getByLabelText(label) as HTMLTextAreaElement
      editor.setSelectionRange(caret, caret)

      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      })
      fireEvent(editor, event)
      expect(event.defaultPrevented).toBe(false)
      expect(result.onChange).not.toHaveBeenCalled()
    },
  )

  it('gives fenced-code Tab handling priority over marker-shaped code', () => {
    const result = renderEditor('```\n- code\n```')
    const editor = screen.getByLabelText('Active code block') as HTMLTextAreaElement
    editor.setSelectionRange(6, 6)

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith('```\n-   code\n```')
  })

  it.each([
    [
      'fenced code',
      '- preceding\n- item\n    ```\n    - code\n    ```',
      '- code',
    ],
    ['indented code', '- preceding\n- item\n\n        - code', '- code'],
    [
      'math',
      '- preceding\n- item\n    $$\n    - equation\n    $$',
      '- equation',
    ],
    [
      'HTML',
      '- preceding\n- item\n    <aside>\n    - metadata\n    </aside>',
      '- metadata',
    ],
  ])('does not treat marker-shaped %s inside a list as an item', (
    _name,
    source,
    marker,
  ) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(editor.value).toBe(source)
    const caret = source.indexOf(marker) + 2
    editor.setSelectionRange(caret, caret)
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
  })

  it.each([
    [
      'fenced code',
      '- preceding\n- item\n    ```md\n    - \n    ```',
    ],
    [
      'display math',
      '- preceding\n- item\n    $$\n    - \n    $$',
    ],
    [
      'HTML',
      '- preceding\n- item\n    <aside>\n    - \n    </aside>',
    ],
    [
      'indented code',
      '- preceding\n- item\n\n        - \n\n    continuation',
    ],
  ])('leaves an empty marker-shaped line inside nested %s untouched', (
    _name,
    source,
  ) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const caret = source.indexOf('- ', source.indexOf('- item') + 1) + 2
    editor.setSelectionRange(caret, caret)

    for (const key of ['Enter', 'Backspace', 'Tab']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      })
      fireEvent(editor, event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(result.onChange).not.toHaveBeenCalled()
    expect(editor.value).toBe(source)
  })

  it('indents complete selected items with continuations and nested children', async () => {
    const onSelectionChange = vi.fn()
    const source = [
      '- preceding',
      '- first',
      '  continuation',
      '    - child',
      '      child continuation',
      '- second',
      '  second continuation',
    ].join('\n')
    const expected = [
      '- preceding',
      '  - first',
      '    continuation',
      '      - child',
      '        child continuation',
      '  - second',
      '    second continuation',
    ].join('\n')
    const result = renderEditor(source, { onSelectionChange })
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const start = source.indexOf('- first') + 2
    const end = source.indexOf('- second') + 2
    editor.setSelectionRange(start, end, 'forward')

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
    await waitFor(() => {
      expect(editor.selectionStart).toBe(start + 2)
      expect(editor.selectionEnd).toBe(end + 10)
      expect(editor.selectionDirection).toBe('forward')
    })
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      start: start + 2,
      end: end + 10,
      direction: 'forward',
    })
  })

  it('indents the current item together with its nested subtree only', () => {
    const source = [
      '- preceding',
      '- parent',
      '    continued',
      '    - child',
      '        nested',
      '- sibling',
    ].join('\n')
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(source.indexOf('- parent') + 2, source.indexOf('- parent') + 2)

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith(
      [
        '- preceding',
        '  - parent',
        '      continued',
        '      - child',
        '          nested',
        '- sibling',
      ].join('\n'),
    )
  })

  it('outdents complete selected items while preserving relative indentation', () => {
    const source = [
      '- parent',
      '    - first',
      '        continuation',
      '        - child',
      '    - second',
      '        continuation',
    ].join('\n')
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      source.indexOf('- first') + 2,
      source.length - 3,
      'backward',
    )

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(
      [
        '- parent',
        '- first',
        '    continuation',
        '    - child',
        '- second',
        '    continuation',
      ].join('\n'),
    )
    expect(editor.selectionDirection).toBe('backward')
  })

  it('leaves a root item and its complete subtree unchanged on Shift+Tab', () => {
    const source = [
      '- root',
      '  continuation',
      '    - child',
      '      child continuation',
    ].join('\n')
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, 2)
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
    expect(editor.value).toBe(source)
  })

  it('leaves selected root items and descendants unchanged on Shift+Tab', () => {
    const source = [
      '- first',
      '    - first child',
      '- second',
      '  second continuation',
    ].join('\n')
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, source.indexOf('- second') + 2)
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
    expect(editor.value).toBe(source)
  })

  it.each([1, 2, 3])(
    'removes the same external %i-space outdent width from the subtree',
    (width) => {
      const external = ' '.repeat(width)
      const source = [
        `${external}- root`,
        `${external}    continuation`,
        `${external}    - child`,
      ].join('\n')
      const expected = [
        '- root',
        '    continuation',
        '    - child',
      ].join('\n')
      const result = renderEditor(source)
      const editor = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      editor.setSelectionRange(2, 2)

      fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

      expect(result.onChange).toHaveBeenLastCalledWith(expected)
    },
  )

  it('uses the selected nested marker width for every descendant outdent', () => {
    const source = [
      '- parent',
      '   - child',
      '      continuation',
      '      - grandchild',
    ].join('\n')
    const expected = [
      '- parent',
      '- child',
      '   continuation',
      '   - grandchild',
    ].join('\n')
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(source.indexOf('- child') + 2, source.indexOf('- child') + 2)

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it.each([
    {
      name: 'ordered parent and non-one ordered child',
      source: '1. parent\n2. child',
      expected: '1. parent\n\n   2. child',
      ordered: true,
      start: 2,
    },
    {
      name: 'wide ordered parent',
      source: '10. parent\n11. child',
      expected: '10. parent\n\n    11. child',
      ordered: true,
      start: 11,
    },
    {
      name: 'unordered parent with a different child marker',
      source: '+ parent\n+ child',
      expected: '+ parent\n  + child',
      ordered: false,
      start: null,
    },
  ])('creates parser-correct nesting for $name', ({
    source,
    expected,
    ordered,
    start,
  }) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const childMarker = source.lastIndexOf('\n') + 1
    editor.setSelectionRange(childMarker, childMarker)

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
    const rootList = markdown.parseDocument(expected).ast.children[0]
    expect(rootList).toMatchObject({
      type: 'list',
      ordered,
      children: [{
        type: 'listItem',
        children: [
          { type: 'paragraph' },
          {
            type: 'list',
            ordered,
            start,
            children: [{ type: 'listItem' }],
          },
        ],
      }],
    })
    expect(expected).toContain(source.slice(childMarker, childMarker + 2).trim())
  })

  it('keeps a caret attached to the marker when indenting from line start', async () => {
    const source = '- parent\n- child'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const markerStart = source.indexOf('- child')
    editor.setSelectionRange(markerStart, markerStart)

    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(result.onChange).toHaveBeenLastCalledWith('- parent\n  - child')
    await waitFor(() => expect(editor.selectionStart).toBe(markerStart + 2))
  })

  it('edits AST-external leading indentation without losing canonical source', async () => {
    const result = renderEditor('   - item')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(editor.value).toBe('- item')
    editor.setSelectionRange(2, 2)

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith('- item')
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(editor, undo)
    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('   - item')
    await waitFor(() => expect(editor.value).toBe('- item'))
  })

  it.each([
    ['009. padded', '009. padded\n010. '],
    ['3) parenthesized', '3) parenthesized\n4) '],
    ['- [X] completed', '- [X] completed\n- [ ] '],
  ])('preserves list marker style when continuing %s', (source, expected) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it('keeps a nine-digit ordered continuation marker CommonMark-valid', () => {
    const result = renderEditor('999999999. item')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    const next = result.onChange.mock.calls.at(-1)?.[0] as string
    expect(next).toBe('999999999. item\n1. ')
    expect(markdown.parseDocument(next).ast.children[0]).toMatchObject({
      type: 'list',
      ordered: true,
      children: [{ type: 'listItem' }, { type: 'listItem' }],
    })
  })

  it('removes only marker and task prefixes without flattening hierarchy', () => {
    const result = renderEditor('- parent\n    - [x] child')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length - 5, editor.value.length - 5)

    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(result.onChange).toHaveBeenLastCalledWith('- parent\n    child')
  })

  it.each([
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ])('does not remove a marker with modified Backspace: %o', (modifier) => {
    const result = renderEditor('- item')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(2, 2)
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
      ...modifier,
    })

    fireEvent(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
  })

  it('ignores list shortcuts during IME composition', () => {
    const result = renderEditor('- item')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.compositionStart(editor)

    for (const key of ['Enter', 'Tab', 'Backspace']) {
      fireEvent.keyDown(editor, { key })
    }

    expect(result.onChange).not.toHaveBeenCalled()
  })

  it('preserves CRLF while continuing and indenting list items', () => {
    const source = '- parent\r\n- first\r\n  continuation'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(11, 11)

    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '- parent\r\n  - first\r\n    continuation',
    )
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect((result.onChange.mock.calls.at(-1)?.[0] as string).includes('\r\n')).toBe(
      true,
    )
  })

  it.each([
    {
      name: 'unordered',
      source: '- parent\r\n\r\n- child',
      nested: '- parent\r\n\r\n  - child',
      caret: 14,
    },
    {
      name: 'ordered',
      source: '1. parent\r\n\r\n2. child',
      nested: '1. parent\r\n\r\n   2. child',
      caret: 16,
    },
    {
      name: 'task',
      source: '- [ ] parent\r\n\r\n- [x] child',
      nested: '- [ ] parent\r\n\r\n  - [x] child',
      caret: 18,
    },
  ])('preserves user-authored loose-list CRLF separators through $name indent, outdent, and undo', async ({
    source,
    nested,
    caret,
  }) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(caret, caret)

    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(nested)
    expect(nested).toContain('\r\n\r\n')
    expect(markdown.parseDocument(nested).ast.children[0]).toMatchObject({
      type: 'list',
      children: [{
        type: 'listItem',
        children: [
          { type: 'paragraph' },
          { type: 'list', children: [{ type: 'listItem' }] },
        ],
      }],
    })

    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    expect(source).toContain('\r\n\r\n')

    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(editor, undo)

    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(nested)
    await waitFor(() => expect(editor.value).toContain('\n\n'))
  })

  it('tracks synthetic separators for multiple nested ordered-list operations', () => {
    const source = '1. root\n2. first\n3. second'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    editor.setSelectionRange(
      source.indexOf('2. first'),
      source.indexOf('2. first'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '1. root\n\n   2. first\n3. second',
    )

    editor.setSelectionRange(
      editor.value.indexOf('3. second'),
      editor.value.indexOf('3. second'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '1. root\n\n   2. first\n\n   3. second',
    )

    editor.setSelectionRange(
      editor.value.indexOf('2. first'),
      editor.value.indexOf('2. first'),
    )
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith(
      '1. root\n2. first\n\n   3. second',
    )

    editor.setSelectionRange(
      editor.value.indexOf('3. second'),
      editor.value.indexOf('3. second'),
    )
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith(source)
  })

  it('restores earlier separator provenance when undoing a later nesting operation', () => {
    const source = '1. root\n2. first\n3. second'
    const onceNested = '1. root\n\n   2. first\n3. second'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. first'),
      editor.value.indexOf('2. first'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    editor.setSelectionRange(
      editor.value.indexOf('3. second'),
      editor.value.indexOf('3. second'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })

    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(editor, undo)
    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(onceNested)

    editor.setSelectionRange(
      editor.value.indexOf('2. first'),
      editor.value.indexOf('2. first'),
    )
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(source)
  })

  it('does not remove a real separator from an identical loose-list block after switching blocks', () => {
    const tight = '1. parent\n2. child'
    const loose = '1. parent\n\n   2. child'
    const divider = '\n\nDivider\n\n'
    const result = renderEditor(`${tight}${divider}${loose}`)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. child'),
      editor.value.indexOf('2. child'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(result.onChange).toHaveBeenLastCalledWith(`${loose}${divider}${loose}`)

    result.rerender(
      <LiveEditor
        content={`${loose}${divider}${loose}`}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const second = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(second.value).toBe(loose)
    second.setSelectionRange(
      second.value.indexOf('2. child'),
      second.value.indexOf('2. child'),
    )

    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(
      `${loose}${divider}1. parent\n\n2. child`,
    )
  })

  it.each([
    ['external replacement', false, false],
    ['source-mode round trip', true, false],
    ['print-mode round trip', false, true],
  ])('does not carry synthetic separator provenance through %s', (
    name,
    sourceMode,
    previewAll,
  ) => {
    const tight = '1. parent\n2. child'
    const loose = '1. parent\n\n   2. child'
    const replacementContent =
      name === 'external replacement' ? `${loose}\n\nExternal` : loose
    const result = renderEditor(tight)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. child'),
      editor.value.indexOf('2. child'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })

    result.rerender(
      <LiveEditor
        content={replacementContent}
        contentRevision={sourceMode ? 1 : 0}
        sourceMode={sourceMode}
        previewAll={previewAll}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    if (sourceMode || previewAll) {
      result.rerender(
        <LiveEditor
          content={replacementContent}
          contentRevision={2}
          sourceMode={false}
          previewAll={false}
          activeBlock={0}
          onChange={result.onChange}
          onActiveBlockChange={result.onActiveBlockChange}
        />,
      )
    }
    const replacement = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    replacement.setSelectionRange(
      replacement.value.indexOf('2. child'),
      replacement.value.indexOf('2. child'),
    )

    fireEvent.keyDown(replacement, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(
      name === 'external replacement'
        ? '1. parent\n\n2. child\n\nExternal'
        : '1. parent\n\n2. child',
    )
  })

  it('does not carry separator provenance across a tab remount', () => {
    const tight = '1. parent\n2. child'
    const loose = '1. parent\n\n   2. child'
    const first = renderEditor(tight)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. child'),
      editor.value.indexOf('2. child'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    first.unmount()

    const second = renderEditor(loose)
    const remounted = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    remounted.setSelectionRange(
      remounted.value.indexOf('2. child'),
      remounted.value.indexOf('2. child'),
    )
    fireEvent.keyDown(remounted, { key: 'Tab', shiftKey: true })

    expect(second.onChange).toHaveBeenLastCalledWith('1. parent\n\n2. child')
  })

  it('does not transfer separator provenance to an identical block moved by drag controls', () => {
    const tight = '1. parent\n2. child'
    const loose = '1. parent\n\n   2. child'
    const result = renderEditor(
      `${tight}\n\n# Divider\n\n${loose}\n\n# After`,
    )
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. child'),
      editor.value.indexOf('2. child'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    result.rerender(
      <LiveEditor
        content={`${loose}\n\n# Divider\n\n${loose}\n\n# After`}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 3' }), {
      key: 'ArrowDown',
      altKey: true,
    })
    const reordered = `${loose}\n\n# Divider\n\n# After\n\n${loose}`
    expect(result.onChange).toHaveBeenLastCalledWith(reordered)
    result.rerender(
      <LiveEditor
        content={reordered}
        activeBlock={3}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const moved = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    expect(moved.value).toBe(loose)
    moved.setSelectionRange(
      moved.value.indexOf('2. child'),
      moved.value.indexOf('2. child'),
    )
    fireEvent.keyDown(moved, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(
      `${loose}\n\n# Divider\n\n# After\n\n1. parent\n\n2. child`,
    )
  })

  it('does not remove a real CRLF separator after undo rotates list history', async () => {
    const tight = '1. parent\r\n2. child'
    const loose = '1. parent\r\n\r\n   2. child'
    const result = renderEditor(tight)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(
      editor.value.indexOf('2. child'),
      editor.value.indexOf('2. child'),
    )
    fireEvent.keyDown(editor, { key: 'Tab' })
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(editor, undo)
    expect(undo.defaultPrevented).toBe(true)
    await waitFor(() => expect(editor.value).toBe('1. parent\n2. child'))

    result.rerender(
      <LiveEditor
        content={loose}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const replacement = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    replacement.setSelectionRange(
      replacement.value.indexOf('2. child'),
      replacement.value.indexOf('2. child'),
    )
    fireEvent.keyDown(replacement, { key: 'Tab', shiftKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '1. parent\r\n\r\n2. child',
    )
  })

  it.each([
    {
      name: 'continuation',
      source: '- item',
      caret: 6,
      key: 'Enter',
    },
    {
      name: 'indent',
      source: '- parent\n- item',
      caret: 11,
      key: 'Tab',
    },
    {
      name: 'marker removal',
      source: '- item',
      caret: 2,
      key: 'Backspace',
    },
  ])('undoes list $name as one controlled transaction', async ({
    source,
    caret,
    key,
  }) => {
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(caret, caret)
    fireEvent.keyDown(editor, { key })
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, undo)

    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    await waitFor(() => {
      expect(editor.value).toBe(source)
      expect(editor.selectionStart).toBe(caret)
    })
  })

  it.each([
    {
      name: 'first',
      source: '- \n- after',
      caret: 2,
      expected: '\n\n- after',
      active: 0,
    },
    {
      name: 'middle',
      source: '- before\n- \n- after',
      caret: 11,
      expected: '- before\n\n\n\n- after',
      active: 1,
    },
    {
      name: 'last',
      source: '- before\n- ',
      caret: 11,
      expected: '- before\n\n',
      active: 1,
    },
  ])(
    'creates an explicit paragraph block when exiting the $name empty item',
    async ({ source, caret, expected, active }) => {
      const onEphemeralStateChange = vi.fn()
      const result = renderEditor(source, { onEphemeralStateChange })
      const editor = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      editor.focus()
      editor.setSelectionRange(caret, caret)

      fireEvent.keyDown(editor, { key: 'Enter' })

      expect(result.onChange).toHaveBeenLastCalledWith(expected)
      expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(active)
      await waitFor(() => {
        const state = onEphemeralStateChange.mock.calls.at(-1)?.[0]
        expect(state.insertedBlocks.content).toBe(expected)
        expect(state.insertedBlocks.blocks).toContainEqual(
          expect.objectContaining({ length: 0 }),
        )
      })
      result.rerender(
        <LiveEditor
          content={expected}
          activeBlock={active}
          onChange={result.onChange}
          onActiveBlockChange={result.onActiveBlockChange}
          onEphemeralStateChange={onEphemeralStateChange}
          initialEphemeralState={
            onEphemeralStateChange.mock.calls.at(-1)?.[0]
          }
        />,
      )
      const paragraph = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      await waitFor(() => {
        expect(paragraph.value).toBe('')
        expect(document.activeElement).toBe(paragraph)
      })
      expect(screen.getByRole('button', { name: 'Move block 1' })).not.toBeNull()
      expect(
        paragraph.closest('.editor-block-row')?.querySelector('.block-drag-handle'),
      ).toBeNull()
    },
  )

  it('undoes an empty-item exit after the parent rerenders the new paragraph', async () => {
    const result = renderEditor('- before\n- ')
    const list = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    list.setSelectionRange(list.value.length, list.value.length)
    fireEvent.keyDown(list, { key: 'Enter' })
    result.rerender(
      <LiveEditor
        content={'- before\n\n'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const paragraph = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(paragraph, undo)

    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('- before\n- ')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
    await waitFor(() => expect(list.value).toBe('- before\n- '))
  })

  it('outdents an empty nested item before exiting the list', async () => {
    const source = '- parent\n    - \n    - sibling\n- after'
    const outdented = '- parent\n- \n    - sibling\n- after'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(source.indexOf('    - ') + 6, source.indexOf('    - ') + 6)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(outdented)
    expect(editor.value).toBe(outdented)
    await waitFor(() => expect(editor.selectionStart).toBe(outdented.indexOf('\n- ') + 3))

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '- parent\n\n\n\n    - sibling\n- after',
    )
  })

  it('preserves CRLF when outdenting an empty nested item', () => {
    const source = '- parent\r\n  - \r\n  - sibling'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(13, 13)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith(
      '- parent\r\n- \r\n  - sibling',
    )
  })

  it('renders task siblings after nested empty-item outdent and parent rerender', async () => {
    const source = '- [ ] parent\n  - [ ] \n  - [ ] sibling\n\nAfter'
    const outdented = '- [ ] parent\n- [ ] \n  - [ ] sibling\n\nAfter'
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(source.indexOf('  - [ ] ') + 8, source.indexOf('  - [ ] ') + 8)

    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onChange).toHaveBeenLastCalledWith(outdented)
    result.rerender(
      <LiveEditor
        content={outdented}
        contentRevision={1}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await waitFor(() => {
      expect(result.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
          .value,
      ).toContain('sibling')
    })
    expect(
      markdown.parseDocument(outdented).ast.children[0],
    ).toMatchObject({ type: 'list' })
  })

  it('undoes an empty nested-item outdent as one transaction', async () => {
    const source = '- parent\n  - '
    const result = renderEditor(source)
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(editor, undo)

    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    await waitFor(() => expect(editor.value).toBe(source))
  })

  it('deduplicates synthetic paragraph metadata when exiting a typed marker', async () => {
    const onEphemeralStateChange = vi.fn()
    const result = renderEditor('Before\n\n', {
      activeBlock: 1,
      onEphemeralStateChange,
    })
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(editor, {
      target: { value: '- ', selectionStart: 2, selectionEnd: 2 },
    })
    const markerState = onEphemeralStateChange.mock.calls.at(-1)?.[0]
    result.rerender(
      <LiveEditor
        content={'Before\n\n- '}
        contentRevision={1}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
        onEphemeralStateChange={onEphemeralStateChange}
        initialEphemeralState={markerState}
      />,
    )
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('Before\n\n')
    await waitFor(() => {
      const state = onEphemeralStateChange.mock.calls.at(-1)?.[0]
      expect(state.insertedBlocks).toEqual({
        content: 'Before\n\n',
        blocks: [{
          offset: 8,
          length: 0,
          leftPadding: 0,
          rightPadding: 0,
        }],
      })
    })
  })

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

  it('reuses the math-detection parse for live rendering', async () => {
    const parse = vi.spyOn(markdownParser, 'parseMarkdownAst')
    const result = renderEditor('$x_t$')

    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )
    // One full-document editor parse and one active-source parse. Rendering
    // consumes the latter model instead of parsing the active source again.
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('does not treat ordinary currency prose as a math live preview', async () => {
    const result = renderEditor('Price is $5 and $10')

    await new Promise((resolve) => window.setTimeout(resolve, 100))
    expect(result.container.querySelector('.active-math-preview')).toBeNull()
  })

  it('hides the active live preview when its input block loses focus', async () => {
    const result = renderEditor('$x_t$')
    const editor = screen.getByLabelText('Active Markdown block')
    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )

    fireEvent.blur(editor)
    expect(result.container.querySelector('.active-live-preview')).toBeNull()

    fireEvent.focus(editor)
    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )
  })

  it('hides a code preview on real focus transfer', async () => {
    const result = renderEditor('```ts\nconst value = 1\n```')
    const editor = screen.getByLabelText('Active code block')
    await waitFor(() =>
      expect(result.container.querySelector('.active-code-preview')).not.toBeNull(),
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    fireEvent.blur(editor, { relatedTarget: outside })

    expect(result.container.querySelector('.active-code-preview')).toBeNull()
    outside.remove()
  })

  it('restores a focused live preview after a print-preview round trip', async () => {
    const result = renderEditor('$x_t$')
    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )
    result.rerender(
      <LiveEditor
        content="$x_t$"
        activeBlock={0}
        previewAll
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    expect(result.container.querySelector('.active-live-preview')).toBeNull()

    result.rerender(
      <LiveEditor
        content="$x_t$"
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() =>
      expect(result.container.querySelector('.active-math-preview')).not.toBeNull(),
    )
  })

  it('shows a live preview for standard multiline display math', async () => {
    const result = renderEditor('$$\n\\left(\\frac{x_i}{\\mathbb R}\\right)\n$$')

    await waitFor(() => {
      expect(
        result.container.querySelector('.active-math-preview .katex-display'),
      ).not.toBeNull()
    })
  })

  it('enters display-math mode at $$ and exits after two Enters', async () => {
    const result = renderEditor('')
    let editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    editor = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    expect(editor.value).toBe('$$\n\n$$')
    expect(result.onChange).toHaveBeenLastCalledWith('$$\n\n$$')
    await waitFor(() => expect(editor.selectionStart).toBe(3))

    fireEvent.change(editor, {
      target: { value: '$$\nx\n$$', selectionStart: 4, selectionEnd: 4 },
    })
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(5))
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n$$\n\n')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
  })

  it('uses controlled edit transactions for math generation and focuses the next block', async () => {
    const execCommand = vi.fn(() => {
      throw new Error('generated math edits must not enter native undo history')
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    const result = renderEditor('Before\n\n', { activeBlock: 1 })
    let editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    editor = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    expect(execCommand).not.toHaveBeenCalled()
    expect(result.onChange).toHaveBeenLastCalledWith('Before\n\n$$\n\n$$')

    fireEvent.change(editor, {
      target: { value: '$$\nx\n$$', selectionStart: 4, selectionEnd: 4 },
    })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(execCommand).not.toHaveBeenCalled()
    await waitFor(() => expect(editor.selectionStart).toBe(5))
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(execCommand).not.toHaveBeenCalled()
    expect(result.onChange).toHaveBeenLastCalledWith('Before\n\n$$\nx\n$$\n\n')

    result.rerender(
      <LiveEditor
        content={'Before\n\n$$\nx\n$$\n\n'}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const next = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(next))
    expect(next.value).toBe('')
  })

  it('makes one canonical commit per generated math edit without execCommand', async () => {
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    const result = renderEditor('')
    let editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    fireEvent.change(editor, {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    editor = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    editor.setSelectionRange(3, 3)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(4))
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(execCommand).not.toHaveBeenCalled()
    expect(result.onChange.mock.calls.map(([value]) => value)).toEqual([
      '$$\n\n$$',
      '$$\n\n\n$$',
      '$$\n\n$$\n\n',
    ])
  })

  it('exits on a native-fast second Enter before the first animation frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const result = renderEditor('$$\nx\n$$')
    const editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(4, 4)

    fireEvent.keyDown(editor, { key: 'Enter' })
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n$$\n\n')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
  })

  it.each(['blur', 'pointerdown'])(
    'does not refocus or move the caret after an immediate %s before math RAF',
    (interruption) => {
      const frames: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      })
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      })
      renderEditor('')
      const editor = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      editor.focus()
      fireEvent.change(editor, {
        target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
      })
      const math = screen.getByLabelText(
        'Active math block',
      ) as HTMLTextAreaElement
      const outside = document.createElement('button')
      document.body.append(outside)
      if (interruption === 'pointerdown') {
        fireEvent.pointerDown(math, { pointerId: 7 })
      }
      outside.focus()
      fireEvent.blur(math, { relatedTarget: outside })

      frames.splice(0).forEach((callback) => callback(0))

      expect(document.activeElement).toBe(outside)
      expect(math.selectionStart).toBe(3)
      outside.remove()
    },
  )

  it('undoes math auto-close as one editor transaction', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })
    const result = renderEditor('')
    const markdownEditor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    markdownEditor.focus()
    fireEvent.change(markdownEditor, {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    const math = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement

    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, undo)

    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('$$')
    const restored = (await screen.findByLabelText(
      'Active Markdown block',
    )) as HTMLTextAreaElement
    expect(restored.value).toBe('$$')
    expect(restored.selectionStart).toBe(2)
    expect(restored.selectionEnd).toBe(2)
  })

  it('lets native undo restore generated auto-close state before custom undo restores the opener', async () => {
    const result = renderEditor('')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(editor, {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    const math = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    fireEvent.change(math, {
      target: { value: '$$\nx\n$$', selectionStart: 4, selectionEnd: 4 },
    })
    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(math, nativeUndo)

    expect(nativeUndo.defaultPrevented).toBe(false)
    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n$$')
    fireEvent.input(math, {
      inputType: 'historyUndo',
      target: { value: '$$\n\n$$', selectionStart: 3, selectionEnd: 3 },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('$$\n\n$$')

    const customUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, customUndo)

    expect(customUndo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('$$')
    expect(
      (await screen.findByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('$$')
  })

  it('lets native undo remove typing after first Enter before custom undo removes Enter', () => {
    const source = '$$\nx\n$$'
    const result = renderEditor(source)
    const math = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    math.setSelectionRange(4, 4)
    fireEvent.keyDown(math, { key: 'Enter' })
    fireEvent.change(math, {
      target: { value: '$$\nx\ny\n$$', selectionStart: 6, selectionEnd: 6 },
    })

    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, nativeUndo)
    expect(nativeUndo.defaultPrevented).toBe(false)
    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\ny\n$$')

    fireEvent.input(math, {
      inputType: 'historyUndo',
      target: { value: '$$\nx\n\n$$', selectionStart: 5, selectionEnd: 5 },
    })
    const customUndo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, customUndo)

    expect(customUndo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    expect(math.value).toBe(source)
    expect(math.selectionStart).toBe(4)
  })

  it('lets native undo remove later next-block typing before custom undo restores grouped exit', () => {
    const result = renderEditor('$$\nx\n$$')
    const math = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    math.setSelectionRange(4, 4)
    fireEvent.keyDown(math, { key: 'Enter' })
    fireEvent.keyDown(math, { key: 'Enter' })
    const exited = '$$\nx\n$$\n\n'
    result.rerender(
      <LiveEditor
        content={exited}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const next = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    fireEvent.change(next, {
      target: { value: 'later', selectionStart: 5, selectionEnd: 5 },
    })

    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(next, nativeUndo)
    expect(nativeUndo.defaultPrevented).toBe(false)
    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n$$\nlater\n')

    fireEvent.input(next, {
      inputType: 'historyUndo',
      target: { value: '', selectionStart: 0, selectionEnd: 0 },
    })
    expect(result.onChange).toHaveBeenLastCalledWith(exited)
    const customUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(next, customUndo)

    expect(customUndo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n\n$$')
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(0)
  })

  it('preserves a CRLF middle-block undo chain through grouped exit', () => {
    const source = 'Before\r\n\r\n$$\r\nx\r\n$$\r\n\r\nAfter'
    const result = renderEditor(source, { activeBlock: 1 })
    let editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Enter' })
    fireEvent.keyDown(editor, { key: 'Enter' })
    const exited = result.onChange.mock.calls.at(-1)?.[0] as string

    result.rerender(
      <LiveEditor
        content={exited}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'z',
      ctrlKey: true,
    })
    const afterExitUndo = 'Before\r\n\r\n$$\r\nx\r\n\r\n$$\r\n\r\nAfter'
    expect(result.onChange).toHaveBeenLastCalledWith(afterExitUndo)

    result.rerender(
      <LiveEditor
        content={afterExitUndo}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    editor = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    expect(editor.selectionStart).toBe(4)
  })

  it('does not let deferred undo focus steal focus after click-away', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const result = renderEditor('$$\nx\n$$')
    const math = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    math.focus()
    math.setSelectionRange(4, 4)
    fireEvent.keyDown(math, { key: 'Enter' })
    fireEvent.keyDown(math, { key: 'Enter' })
    const exited = result.onChange.mock.calls.at(-1)?.[0] as string
    result.rerender(
      <LiveEditor
        content={exited}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Active Markdown block'), {
      key: 'z',
      ctrlKey: true,
    })
    result.rerender(
      <LiveEditor
        content={'$$\nx\n\n$$'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    fireEvent.blur(screen.getByLabelText('Active math block'), {
      relatedTarget: outside,
    })

    frames.splice(0).forEach((callback) => callback(0))

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('orders native typing undo before fallback first-Enter undo with CRLF', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })
    const source = '$$\r\nx\r\n$$'
    const result = renderEditor(source)
    const math = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    math.focus()
    math.setSelectionRange(4, 4, 'backward')
    fireEvent.keyDown(math, { key: 'Enter' })
    await waitFor(() => expect(math.selectionStart).toBe(5))
    fireEvent.change(math, {
      target: { value: '$$\nx\ny\n$$', selectionStart: 6, selectionEnd: 6 },
    })

    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, nativeUndo)
    expect(nativeUndo.defaultPrevented).toBe(false)
    fireEvent.input(math, {
      inputType: 'historyUndo',
      target: { value: '$$\nx\n\n$$', selectionStart: 5, selectionEnd: 5 },
    })

    const customUndo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, customUndo)
    expect(customUndo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith(source)
    expect(math.value).toBe('$$\nx\n$$')
    expect(math.selectionStart).toBe(4)
    expect(math.selectionEnd).toBe(4)
    expect(math.selectionDirection).toBe('backward')
    result.onActiveBlockChange.mockClear()
    fireEvent.keyDown(math, { key: 'Enter' })
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
  })

  it('undoes a middle-block math exit after the parent activates the new block', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })
    const ephemeral = vi.fn()
    const source = 'Before\r\n\r\n$$\r\nx\r\n$$\r\n\r\nAfter'
    const result = renderEditor(source, {
      activeBlock: 1,
      onEphemeralStateChange: ephemeral,
    })
    const math = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    math.focus()
    math.setSelectionRange(4, 4)
    fireEvent.keyDown(math, { key: 'Enter' })
    await waitFor(() => expect(math.selectionStart).toBe(5))
    const beforeExit = result.onChange.mock.calls.at(-1)?.[0] as string
    await waitFor(() => expect(ephemeral).toHaveBeenCalled())
    const beforeMetadata = ephemeral.mock.calls.at(-1)?.[0]

    fireEvent.keyDown(math, { key: 'Enter' })
    const afterExit = result.onChange.mock.calls.at(-1)?.[0] as string
    result.rerender(
      <LiveEditor
        content={afterExit}
        activeBlock={2}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
        onEphemeralStateChange={ephemeral}
      />,
    )
    const next = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    next.focus()
    fireEvent.keyDown(next, { key: 'z', ctrlKey: true })

    expect(result.onChange).toHaveBeenLastCalledWith(beforeExit)
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(1)
    result.rerender(
      <LiveEditor
        content={beforeExit}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
        onEphemeralStateChange={ephemeral}
      />,
    )
    const restored = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    await waitFor(() => {
      expect(document.activeElement).toBe(restored)
      expect(restored.selectionStart).toBe(5)
    })
    expect(restored.value).toBe('$$\nx\n\n$$')
    expect(restored.selectionEnd).toBe(5)
    await waitFor(() =>
      expect(ephemeral).toHaveBeenLastCalledWith(beforeMetadata),
    )

    fireEvent.keyDown(restored, { key: 'Enter' })
    expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(2)
  })

  it.each([
    ['blur', (editor: HTMLTextAreaElement) => fireEvent.blur(editor)],
    ['pointer move', (editor: HTMLTextAreaElement) =>
      fireEvent.pointerDown(editor, { pointerId: 1 })],
    ['selection change', (editor: HTMLTextAreaElement) => {
      editor.setSelectionRange(3, 3)
      fireEvent.select(editor)
    }],
    ['modified Enter', (editor: HTMLTextAreaElement) =>
      fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })],
    ['composition', (editor: HTMLTextAreaElement) =>
      fireEvent.compositionStart(editor)],
  ])('disarms math exit after %s', async (_name, intervene) => {
    const result = renderEditor('$$\nx\n$$')
    const editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(5))

    intervene(editor)
    if (_name === 'composition') fireEvent.compositionEnd(editor)
    editor.setSelectionRange(5, 5)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
    expect(result.onChange).toHaveBeenLastCalledWith('$$\nx\n\n\n$$')
  })

  it('requires the exact armed value and adjacent caret for math exit', async () => {
    const result = renderEditor('$$\nx\n$$')
    const editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(5))

    editor.setSelectionRange(3, 3)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
    expect(result.onChange).toHaveBeenLastCalledWith('$$\n\nx\n\n$$')
  })

  it('disarms math exit across toolbar and block sessions', async () => {
    const source = '$$\nx\n$$\n\nAfter'
    const result = renderEditor(source)
    let editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(5))

    result.rerender(
      <LiveEditor
        content={'$$\nx\n\n$$\n\nAfter'}
        activeBlock={0}
        formatRequest={{ id: 1, command: 'bold' }}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    await waitFor(() => expect(result.onChange).toHaveBeenCalled())
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()

    result.rerender(
      <LiveEditor
        content={'$$\nx\n\n$$\n\nAfter'}
        activeBlock={1}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    result.rerender(
      <LiveEditor
        content={'$$\nx\n\n$$\n\nAfter'}
        activeBlock={0}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )
    editor = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    editor.setSelectionRange(5, 5)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
  })

  it('disarms math exit after ordinary input', async () => {
    const result = renderEditor('$$\nx\n$$')
    const editor = screen.getByLabelText(
      'Active math block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(editor.selectionStart).toBe(5))

    fireEvent.input(editor, {
      target: {
        value: '$$\nxy\n\n$$',
        selectionStart: 5,
        selectionEnd: 5,
      },
    })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
  })

  it.each([
    [
      'first',
      '$$\nx\n$$\n\nAfter',
      0,
      '$$\nx\n$$\n\n\nAfter',
      1,
    ],
    [
      'middle',
      'Before\n\n$$\nx\n$$\n\nAfter',
      1,
      'Before\n\n$$\nx\n$$\n\n\nAfter',
      2,
    ],
    [
      'last',
      'Before\n\n$$\nx\n$$',
      1,
      'Before\n\n$$\nx\n$$\n\n',
      2,
    ],
  ])(
    'creates and focuses a next block after the %s math block',
    async (_position, source, activeBlock, expected, nextActive) => {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      })
      const result = renderEditor(source, { activeBlock })
      const math = screen.getByLabelText(
        'Active math block',
      ) as HTMLTextAreaElement
      math.setSelectionRange(4, 4)
      fireEvent.keyDown(math, { key: 'Enter' })
      await waitFor(() => expect(math.selectionStart).toBe(5))
      fireEvent.keyDown(math, { key: 'Enter' })
      expect(result.onChange).toHaveBeenLastCalledWith(expected)
      expect(result.onActiveBlockChange).toHaveBeenLastCalledWith(nextActive)

      result.rerender(
        <LiveEditor
          content={expected}
          activeBlock={nextActive}
          onChange={result.onChange}
          onActiveBlockChange={result.onActiveBlockChange}
        />,
      )
      const next = screen.getByLabelText(
        'Active Markdown block',
      ) as HTMLTextAreaElement
      await waitFor(() => expect(document.activeElement).toBe(next))
      expect(next.value).toBe('')
    },
  )

  it('intercepts undo while generated math snapshots remain', async () => {
    const execCommand = vi.fn()
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    const result = renderEditor('')
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '$$', selectionStart: 2, selectionEnd: 2 },
    })
    const math = screen.getByLabelText('Active math block') as HTMLTextAreaElement
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(math, undo)
    expect(undo.defaultPrevented).toBe(true)
    expect(result.onChange).toHaveBeenLastCalledWith('$$')
    expect(
      (await screen.findByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('$$')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('converts yen math openers only when CJK shortcuts are enabled', () => {
    const enabled = renderEditor('', { cjkShortcuts: true })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '¥¥', selectionStart: 2, selectionEnd: 2 },
    })
    expect(
      (screen.getByLabelText('Active math block') as HTMLTextAreaElement).value,
    ).toBe('$$\n\n$$')
    enabled.unmount()

    renderEditor('', { cjkShortcuts: false })
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '¥¥', selectionStart: 2, selectionEnd: 2 },
    })
    expect(
      (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
        .value,
    ).toBe('¥¥')
  })

  it.each(['¥¥', '￥￥'])(
    'converts %s only when its persisted CJK setting is enabled',
    (opener) => {
      const enabled = loadSettings(JSON.stringify({ cjkShortcuts: true }))
      const disabled = loadSettings(JSON.stringify({ cjkShortcuts: false }))
      const first = renderEditor('', { cjkShortcuts: enabled.cjkShortcuts })
      fireEvent.change(screen.getByLabelText('Active Markdown block'), {
        target: { value: opener, selectionStart: 2, selectionEnd: 2 },
      })
      expect(screen.getByLabelText('Active math block')).not.toBeNull()
      first.unmount()

      renderEditor('', { cjkShortcuts: disabled.cjkShortcuts })
      fireEvent.change(screen.getByLabelText('Active Markdown block'), {
        target: { value: opener, selectionStart: 2, selectionEnd: 2 },
      })
      expect(
        (screen.getByLabelText('Active Markdown block') as HTMLTextAreaElement)
          .value,
      ).toBe(opener)
    },
  )

  it.each(['¥¥', '￥￥'])(
    'enters display math for %s when composition ends',
    (opener) => {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      })
      const result = renderEditor('', { cjkShortcuts: true })
      const editor = screen.getByLabelText('Active Markdown block')
      fireEvent.compositionStart(editor)
      fireEvent.change(editor, {
        target: { value: opener, selectionStart: 2, selectionEnd: 2 },
      })
      fireEvent.compositionEnd(editor, { data: opener })

      expect(screen.getByLabelText('Active math block')).not.toBeNull()
      expect(result.onChange).toHaveBeenLastCalledWith('$$\n\n$$')
    },
  )

  it('keeps source mode math openers unaffected', () => {
    const result = renderEditor('', {
      sourceMode: true,
      contentRevision: 0,
      cjkShortcuts: true,
    })
    fireEvent.change(screen.getByLabelText('Markdown source'), {
      target: { value: '￥￥', selectionStart: 2, selectionEnd: 2 },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('￥￥')
    expect(screen.queryByLabelText('Active math block')).toBeNull()
  })

  it('does not auto-close math openers embedded in protected content', () => {
    const result = renderEditor('`code`')
    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: { value: '`$$`', selectionStart: 3, selectionEnd: 3 },
    })
    expect(result.onChange).toHaveBeenLastCalledWith('`$$`')
    expect(screen.queryByLabelText('Active math block')).toBeNull()
  })

  it('preserves CRLF when exiting formula and multiline math blocks', async () => {
    for (const source of ['$$\r\n\r\n$$', '$$\r\nx\r\ny\r\n$$']) {
      const result = renderEditor(source)
      const editor = screen.getByLabelText(
        'Active math block',
      ) as HTMLTextAreaElement
      const caret = editor.value.length - 3
      editor.setSelectionRange(caret, caret)
      fireEvent.keyDown(editor, { key: 'Enter' })
      await waitFor(() => expect(editor.selectionStart).toBe(caret + 1))
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(result.onChange.mock.calls.at(-1)?.[0]).toMatch(/\r\n\r\n$/u)
      result.unmount()
    }
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

  it('lets modified Tab bubble out of fenced code for tab switching', () => {
    const result = renderEditor('```ts\nvalue\n```')
    const editor = screen.getByLabelText('Active code block')
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    editor.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
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

  it('restores the first block boundary without synchronously reparsing', () => {
    const parse = vi.spyOn(markdown, 'parseDocument')
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
    parse.mockClear()

    fireEvent.keyDown(editor(), { key: 'Backspace' })

    expect(parse).not.toHaveBeenCalled()
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

  it('derives heading Enter separation without another document parse', () => {
    const parse = vi.spyOn(markdown, 'parseDocument')
    renderEditor('# Heading\nParagraph')
    const editor = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    editor.setSelectionRange(editor.value.length, editor.value.length)

    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(parse).toHaveBeenCalledOnce()
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

  it('normalizes one source transformation while mapping the selection', async () => {
    const normalize = vi.spyOn(markdownCjk, 'normalizeCjkInput')
    const result = renderEditor('中文', { autoSpacing: true })
    const textarea = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement

    fireEvent.change(textarea, {
      target: { value: '中文text', selectionStart: 6, selectionEnd: 6 },
    })

    expect(result.onChange).toHaveBeenLastCalledWith('中文 text')
    expect(normalize).toHaveBeenCalledOnce()
    await waitFor(() => expect(textarea.selectionStart).toBe(7))
  })

  it('protects converted shortcuts while spacing prose and mapping the caret', async () => {
    const parse = vi.spyOn(markdownParser, 'parseMarkdownAst')
    const result = renderEditor('中文', { autoSpacing: true })
    const textarea = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    const value = '￥中文A￥ ·中文A· 正文B'
    parse.mockClear()

    fireEvent.change(textarea, {
      target: {
        value,
        selectionStart: value.length,
        selectionEnd: value.length,
      },
    })

    expect(result.onChange).toHaveBeenLastCalledWith('$中文A$ `中文A` 正文 B')
    expect(parse).toHaveBeenCalledTimes(3)
    await waitFor(() => expect(textarea.selectionStart).toBe(value.length + 1))
  })

  it.each([
    ['inline code', '`中文A`', '`中文A`'],
    ['link', '[中文A](./中文React)', '[中文 A](./中文React)'],
    ['image', '![中文A](./中文React.png)', '![中文 A](./中文React.png)'],
    ['math', '$中文A$', '$中文A$'],
    ['fence', '```\n中文A\n```', '```\n中文A\n```'],
    [
      'HTML',
      '<div data-title="中文A">中文React</div>',
      '<div data-title="中文A">中文React</div>',
    ],
    [
      'Marp metadata',
      '---\nmarp: true\ntheme: 中文Theme\ntitle: "中文A"\n---',
      '---\nmarp: true\ntheme: 中文Theme\ntitle: "中文A"\n---',
    ],
    [
      'Slidev metadata',
      '+++\ntheme = "中文Theme"\n+++\n::right::\n<Tweet id="中文A" />',
      '+++\ntheme = "中文Theme"\n+++\n::right::\n<Tweet id="中文A" />',
    ],
  ])('preserves protected %s content when it is pasted', (
    _name,
    pasted,
    expected,
  ) => {
    const result = renderEditor('中文A', { autoSpacing: true })

    fireEvent.change(screen.getByLabelText('Active Markdown block'), {
      target: {
        value: pasted,
        selectionStart: pasted.length,
        selectionEnd: pasted.length,
      },
    })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it.each([
    ['inline code', '`中文A`', '中文A', '中文 A'],
    [
      'link',
      '[中文A](./中文React)',
      '中文A ./中文React',
      '中文 A ./中文 React',
    ],
    [
      'image',
      '![中文A](./中文React.png)',
      '中文A ./中文React.png',
      '中文 A ./中文 React.png',
    ],
    ['math', '$中文A$', '中文A', '中文 A'],
    ['fence', '```\n中文A\n```', '中文A', '中文 A'],
    ['HTML', '<span>中文A</span>', '中文A', '中文 A'],
  ])('normalizes text exposed by removing protected %s delimiters', (
    _name,
    before,
    after,
    expected,
  ) => {
    const result = renderEditor(before, { autoSpacing: true })

    fireEvent.change(screen.getByLabelText(/Active (?:Markdown|code) block/), {
      target: {
        value: after,
        selectionStart: after.length,
        selectionEnd: after.length,
      },
    })

    expect(result.onChange).toHaveBeenLastCalledWith(expected)
  })

  it('reparses the edited block when protected delimiters are introduced', () => {
    const parse = vi.spyOn(markdownParser, 'parseMarkdownAst')
    const result = renderEditor('中文A', { autoSpacing: true })
    const textarea = screen.getByLabelText('Active Markdown block')
    parse.mockClear()

    fireEvent.change(textarea, {
      target: {
        value: '`中文A`',
        selectionStart: 5,
        selectionEnd: 5,
      },
    })

    expect(parse).toHaveBeenCalledOnce()
    expect(result.onChange).toHaveBeenLastCalledWith('`中文A`')
  })

  it('reuses cached protected ranges for ordinary auto-spaced typing', async () => {
    const parse = vi.spyOn(markdownParser, 'parseMarkdownAst')
    const normalize = vi.spyOn(markdownCjk, 'normalizeCjkInput')
    const protectedTail =
      ' `代码中文A` and https://example.com/路径/中文A'
    const source = `中文${protectedTail}`
    const result = renderEditor(source, { autoSpacing: true })
    const textarea = screen.getByLabelText(
      'Active Markdown block',
    ) as HTMLTextAreaElement
    parse.mockClear()

    fireEvent.change(textarea, {
      target: {
        value: `中文text${protectedTail}`,
        selectionStart: 6,
        selectionEnd: 6,
      },
    })

    expect(parse).not.toHaveBeenCalled()
    expect(normalize).toHaveBeenCalledOnce()
    expect(normalize).toHaveBeenCalledWith(
      `中文text${protectedTail}`,
      { start: 0, end: 6 + protectedTail.length },
      true,
      expect.any(Array),
      true,
    )
    expect(result.onChange).toHaveBeenLastCalledWith(
      `中文 text${protectedTail}`,
    )
    await waitFor(() => expect(textarea.selectionStart).toBe(7))
  })

  it('ends composition and normalizes safely when the block blurs', () => {
    const result = renderEditor('中文', { autoSpacing: true })
    const textarea = screen.getByLabelText('Active Markdown block')
    fireEvent.compositionStart(textarea)
    fireEvent.change(textarea, { target: { value: '中文text' } })

    fireEvent.blur(textarea)
    expect(result.onChange).toHaveBeenLastCalledWith('中文 text')
  })

  it('ignores IME Process key events', () => {
    const result = renderEditor('Current')
    const textarea = screen.getByLabelText('Active Markdown block')
    fireEvent.keyDown(textarea, { key: 'Process' })

    expect(result.onChange).not.toHaveBeenCalled()
    expect(result.onActiveBlockChange).not.toHaveBeenCalled()
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
    const editorLabel = 'Active YAML front matter block'

    fireEvent.blur(screen.getByLabelText(editorLabel))

    expect(result.onChange).not.toHaveBeenCalled()
    expect(
      (screen.getByLabelText(editorLabel) as HTMLTextAreaElement).value,
    ).toContain('"中文A"')
  })
})

describe('LiveEditor block reordering', () => {
  it('reuses the current document model when beginning a block move', () => {
    const parse = vi.spyOn(markdown, 'parseDocument')
    renderEditor('First\n\nSecond\n\nThird')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move block 1' }), {
      key: 'ArrowDown',
      altKey: true,
    })

    expect(parse).toHaveBeenCalledTimes(2)
  })

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
  it.each([
    [true, '$$'],
    [false, '￥￥'],
  ])(
    'normalizes yen shortcuts on blur when CJK shortcuts are %s',
    (cjkShortcuts, expected) => {
      const result = renderEditor('', {
        sourceMode: true,
        contentRevision: 0,
        cjkShortcuts,
      })
      const source = screen.getByLabelText(
        'Markdown source',
      ) as HTMLTextAreaElement
      fireEvent.change(source, {
        target: { value: '￥￥', selectionStart: 2, selectionEnd: 2 },
      })
      fireEvent.blur(source)

      expect(result.onChange).toHaveBeenLastCalledWith(expected)
      expect(source.value).toBe(expected)
    },
  )

  it('commits one canonical edit when native insertText dispatches input', async () => {
    const execCommand = vi.fn((_command: string, _ui: boolean, replacement: string) => {
      const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
      source.setRangeText(
        replacement,
        source.selectionStart,
        source.selectionEnd,
        'end',
      )
      fireEvent.input(source, { target: { value: source.value } })
      return true
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    const result = renderEditor('first\r\nword', {
      sourceMode: true,
      contentRevision: 0,
    })
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
    source.setSelectionRange('first\n'.length, source.value.length)

    result.rerender(
      <LiveEditor
        content={'first\r\nword'}
        contentRevision={0}
        activeBlock={0}
        sourceMode
        formatRequest={{ id: 1, command: 'bold' }}
        onChange={result.onChange}
        onActiveBlockChange={result.onActiveBlockChange}
      />,
    )

    await waitFor(() => expect(source.value).toBe('first\n**word**'))
    expect(result.onChange).toHaveBeenLastCalledWith('first\r\n**word**')
    expect(result.onChange).toHaveBeenCalledOnce()
    expect(execCommand).toHaveBeenCalledOnce()
  })

  it('lets modified Tab bubble out of source mode for tab switching', () => {
    const result = renderEditor('source', {
      sourceMode: true,
      contentRevision: 0,
    })
    const source = screen.getByLabelText('Markdown source')
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })

    source.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    expect(result.onChange).not.toHaveBeenCalled()
  })

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
