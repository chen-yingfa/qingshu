import { describe, expect, it } from 'vitest'

import { parseBlocks } from './markdown'
import { reorderMarkdownBlocks } from './reorder'

describe('reorderMarkdownBlocks', () => {
  it('moves a middle block before the first while preserving separator slots', () => {
    const source = 'First\r\n\r\nSecond\n\n\nThird'

    expect(reorderMarkdownBlocks(source, parseBlocks(source), 1, 0)).toEqual({
      content: 'Second\r\n\r\nFirst\n\n\nThird',
      index: 0,
    })
  })

  it('moves the first block after the last', () => {
    const source = 'First\n\nSecond\n\nThird'

    expect(reorderMarkdownBlocks(source, parseBlocks(source), 0, 3)).toEqual({
      content: 'Second\n\nThird\n\nFirst',
      index: 2,
    })
  })

  it('does not rewrite source when dropped on either adjacent boundary', () => {
    const source = 'First\n\nSecond\n\nThird'
    const blocks = parseBlocks(source)

    expect(reorderMarkdownBlocks(source, blocks, 1, 1)).toEqual({
      content: source,
      index: 1,
    })
    expect(reorderMarkdownBlocks(source, blocks, 1, 2)).toEqual({
      content: source,
      index: 1,
    })
  })
})
