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
