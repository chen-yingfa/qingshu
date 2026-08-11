// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { DocumentSourceEditor } from './DocumentSourceEditor'

afterEach(cleanup)

it('edits canonical source and preserves CRLF endings', () => {
  const onChange = vi.fn()
  render(
    <DocumentSourceEditor
      content={'first\r\nsecond'}
      contentRevision={0}
      onChange={onChange}
    />,
  )

  fireEvent.change(screen.getByLabelText('Markdown source'), {
    target: {
      value: 'first\nsecond!',
      selectionStart: 13,
      selectionEnd: 13,
    },
  })

  expect(onChange).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenCalledWith('first\r\nsecond!')
})

it('normalizes configured CJK text on blur while preserving CRLF and selection', () => {
  const onChange = vi.fn()
  render(
    <DocumentSourceEditor
      content={'标题\r\n中文text "中文"'}
      contentRevision={0}
      autoSpacing
      onChange={onChange}
    />,
  )
  const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
  source.setSelectionRange(source.value.length, source.value.length)

  fireEvent.blur(source)

  expect(onChange).toHaveBeenLastCalledWith('标题\r\n中文 text “中文”')
  expect(source.value).toBe('标题\n中文 text “中文”')
  expect(source.selectionStart).toBe(source.value.length)
})

it('defers normalization through IME composition and ignores Process keys', () => {
  const onChange = vi.fn()
  render(
    <DocumentSourceEditor
      content="中文"
      contentRevision={0}
      autoSpacing
      onChange={onChange}
    />,
  )
  const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement
  fireEvent.compositionStart(source)
  fireEvent.change(source, {
    target: { value: '中文text', selectionStart: 6, selectionEnd: 6 },
  })
  fireEvent.keyDown(source, { key: 'Process' })
  expect(onChange).toHaveBeenLastCalledWith('中文text')

  fireEvent.compositionEnd(source)
  expect(onChange).toHaveBeenLastCalledWith('中文 text')
})
