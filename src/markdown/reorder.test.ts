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

  it('reorders individual tight-list items without changing their exact slices', () => {
    const source = '1. one\r\n1. two\r\n1. three'
    const blocks = parseBlocks(source)

    expect(blocks).toHaveLength(3)
    expect(reorderMarkdownBlocks(source, blocks, 2, 0)).toEqual({
      content: '1. three\r\n1. one\r\n1. two',
      index: 0,
    })
  })

  it('keeps frontmatter locked while moving an item across list groups', () => {
    const source = '---\r\ntitle: Locked\r\n---\r\n\r\n- one\r\n- two\r\n\r\nAfter'
    const blocks = parseBlocks(source).filter((block) => block.type !== 'yaml')

    const reordered = reorderMarkdownBlocks(source, blocks, 1, 3)

    expect(reordered.content).toBe(
      '---\r\ntitle: Locked\r\n---\r\n\r\n- one\r\n\r\nAfter\r\n\r\n- two',
    )
    expect(parseBlocks(reordered.content).map((block) => block.type)).toEqual([
      'yaml',
      'listItem',
      'paragraph',
      'listItem',
    ])
  })
})
