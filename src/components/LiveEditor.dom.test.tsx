// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveEditor } from './LiveEditor'

afterEach(cleanup)

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
    expect(reference.getAttribute('href')).toBe('#user-content-fn-note')
    expect(document.getElementById('user-content-fn-note')?.textContent).toContain(
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
})

describe('LiveEditor keyboard and composition behavior', () => {
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
})
