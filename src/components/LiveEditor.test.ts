import { describe, expect, it } from 'vitest'

import {
  applyInlineFormat,
  mergeBlockAtStart,
  moveByCjkWord,
  replaceBlockSource,
} from './LiveEditor'

describe('editor source operations', () => {
  it('replaces a parsed block without changing surrounding canonical source', () => {
    const source = '# One\n\nSecond  \n\nThird'

    expect(replaceBlockSource(source, { start: 7, end: 15 }, 'Changed')).toBe(
      '# One\n\nChanged\n\nThird',
    )
  })

  it('merges at the start of a block while retaining a single readable separator', () => {
    expect(mergeBlockAtStart('First paragraph\n\nSecond', 17)).toEqual({
      content: 'First paragraph\nSecond',
      caret: 16,
    })
  })

  it('wraps a selection and returns the new selection range', () => {
    expect(applyInlineFormat('写作 text', 3, 7, '**', '**')).toEqual({
      value: '写作 **text**',
      selectionStart: 5,
      selectionEnd: 9,
    })
  })

  it('moves across CJK words using Intl segmentation', () => {
    expect(moveByCjkWord('今天 writing 很好', 0, 1)).toBe(2)
    expect(moveByCjkWord('今天 writing 很好', 10, -1)).toBe(3)
  })
})
