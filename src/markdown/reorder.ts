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
  const separators = blocks.slice(0, -1).map((block, index) =>
    source.slice(block.end, blocks[index + 1].start),
  )
  const prefix = source.slice(0, blocks[0].start)
  const suffix = source.slice(blocks.at(-1)!.end)
  const [moved] = blockSources.splice(fromIndex, 1)
  const index = boundary > fromIndex ? boundary - 1 : boundary
  blockSources.splice(index, 0, moved)

  return {
    content:
      prefix +
      blockSources
        .map((block, blockIndex) =>
          blockIndex < separators.length
            ? block + separators[blockIndex]
            : block,
        )
        .join('') +
      suffix,
    index,
  }
}
