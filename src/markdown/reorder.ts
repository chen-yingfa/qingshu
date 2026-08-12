import type { MarkdownBlock } from './markdown'

export interface ReorderedMarkdown {
  content: string
  index: number
}

export function reorderMarkdownBlocks(
  source: string,
  blocks: MarkdownBlock[],
  fromIndex: number,
  boundary: number,
): ReorderedMarkdown {
  if (
    fromIndex < 0 ||
    fromIndex >= blocks.length ||
    boundary < 0 ||
    boundary > blocks.length ||
    boundary === fromIndex ||
    boundary === fromIndex + 1
  ) {
    return { content: source, index: Math.max(0, fromIndex) }
  }

  const blockSources = blocks.map((block) =>
    source.slice(block.start, block.end),
  )
  const reorderedBlocks = [...blocks]
  const separators = blocks.slice(0, -1).map((block, index) =>
    source.slice(block.end, blocks[index + 1].start),
  )
  const prefix = source.slice(0, blocks[0].start)
  const suffix = source.slice(blocks.at(-1)!.end)
  const [moved] = blockSources.splice(fromIndex, 1)
  const [movedBlock] = reorderedBlocks.splice(fromIndex, 1)
  const index = boundary > fromIndex ? boundary - 1 : boundary
  blockSources.splice(index, 0, moved)
  reorderedBlocks.splice(index, 0, movedBlock)

  const safeSeparator = (separator: string, separatorIndex: number) => {
    const left = reorderedBlocks[separatorIndex]
    const right = reorderedBlocks[separatorIndex + 1]
    const crossesListBoundary =
      (left.type === 'listItem') !== (right.type === 'listItem')
    if (!crossesListBoundary || /(?:\r?\n[ \t]*){2}/u.test(separator)) {
      return separator
    }
    const eol = separator.includes('\r\n')
      ? '\r\n'
      : source.includes('\r\n')
        ? '\r\n'
        : '\n'
    return separator + eol
  }

  return {
    content:
      prefix +
      blockSources
        .map((block, blockIndex) =>
          blockIndex < separators.length
            ? block + safeSeparator(separators[blockIndex], blockIndex)
            : block,
        )
        .join('') +
      suffix,
    index,
  }
}
