import {
  parseMarkdownAst,
  type MarkdownAstNode as MarkdownNode,
} from './parser'

export interface DocumentStats {
  words: number
  characters: number
  readingMinutes: number
}

type TextTransform = (text: string, start: number, source: string) => string

export interface SourceRange {
  start: number
  end: number
}

const protectedNodeTypes = new Set([
  'code',
  'html',
  'inlineCode',
  'math',
  'inlineMath',
])

function collectPresentationRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = []
  const frontMatterStart = source.match(/^(?:\uFEFF)?(---|\+\+\+)[ \t]*\r?\n/u)
  if (frontMatterStart) {
    const delimiter = frontMatterStart[1].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const closing = new RegExp(`^${delimiter}[ \\t]*(?:\\r?\\n|$)`, 'gmu')
    closing.lastIndex = frontMatterStart[0].length
    const match = closing.exec(source)
    if (match) ranges.push({ start: 0, end: match.index + match[0].length })
  }

  for (const match of source.matchAll(/^[ \t]*::[^\r\n]*::[ \t]*(?:\r?\n|$)/gmu)) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  const componentStart =
    /^[ \t]*<([A-Z][\p{L}\p{N}_.:-]*)(?=[\s/>])[^\r\n>]*(?:\/>|>)[ \t]*(?:\r?\n|$)/gmu
  for (const match of source.matchAll(componentStart)) {
    if (match[0].includes('/>')) {
      ranges.push({ start: match.index, end: match.index + match[0].length })
      continue
    }
    const closing = new RegExp(
      `^[ \\t]*</${match[1].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}>[ \\t]*(?:\\r?\\n|$)`,
      'gmu',
    )
    closing.lastIndex = match.index + match[0].length
    const end = closing.exec(source)
    ranges.push({
      start: match.index,
      end: end ? end.index + end[0].length : match.index + match[0].length,
    })
  }
  return ranges
}

function destinationRange(
  source: string,
  start: number,
  end: number,
  definition: boolean,
): SourceRange | undefined {
  const raw = source.slice(start, end)
  let index: number

  if (definition) {
    const labelEnd = raw.indexOf(']:')
    if (labelEnd === -1) return undefined
    index = labelEnd + 2
  } else {
    const marker = raw.lastIndexOf('](')
    if (marker === -1) return undefined
    index = marker + 2
  }

  while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1
  if (index >= raw.length) return undefined

  if (raw[index] === '<') {
    const destinationStart = index + 1
    let destinationEnd = destinationStart
    while (destinationEnd < raw.length && raw[destinationEnd] !== '>') {
      destinationEnd += raw[destinationEnd] === '\\' ? 2 : 1
    }
    return { start: start + destinationStart, end: start + destinationEnd }
  }

  const destinationStart = index
  let depth = 0
  while (index < raw.length) {
    const character = raw[index]
    if (character === '\\') {
      index += 2
      continue
    }
    if (/[\t\n\r ]/.test(character)) break
    if (character === '(') depth += 1
    if (character === ')') {
      if (depth === 0) break
      depth -= 1
    }
    index += 1
  }

  return { start: start + destinationStart, end: start + index }
}

export function protectedMarkdownRanges(
  source: string,
  tree: MarkdownNode = parseMarkdownAst(source),
): SourceRange[] {
  const ranges: SourceRange[] = collectPresentationRanges(source)

  const visit = (node: MarkdownNode) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset

    if (start !== undefined && end !== undefined) {
      if (protectedNodeTypes.has(node.type)) {
        ranges.push({ start, end })
        return
      }

      if (node.type === 'link' || node.type === 'image') {
        const raw = source.slice(start, end)
        if (!raw.startsWith('[') && !raw.startsWith('![')) {
          ranges.push({ start, end })
        } else {
          const range = destinationRange(source, start, end, false)
          if (range) ranges.push(range)
        }
      }

      if (node.type === 'definition') {
        const range = destinationRange(source, start, end, true)
        if (range) ranges.push(range)
      }
    }

    node.children?.forEach(visit)
  }

  visit(tree)

  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: SourceRange[] = []

  for (const range of sorted) {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

export function remapProtectedRanges(
  before: string,
  after: string,
  ranges: readonly SourceRange[],
): SourceRange[] {
  let prefix = 0
  while (prefix < before.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix += 1
  const previousEnd = before.length - suffix
  const nextEnd = after.length - suffix
  const delta = after.length - before.length
  return ranges.map(range => ({
    start:
      range.start <= prefix
        ? range.start
        : range.start >= previousEnd
          ? range.start + delta
          : prefix,
    end:
      range.end < prefix
        ? range.end
        : range.end >= previousEnd
          ? range.end + delta
          : nextEnd,
  }))
}

function transformMarkdownText(
  source: string,
  transform: TextTransform,
  editableRange?: SourceRange,
  protectedRanges?: readonly SourceRange[],
): string {
  const ranges = [
    ...(protectedRanges ?? protectedMarkdownRanges(source)),
    ...(editableRange
      ? [
          { start: 0, end: Math.max(0, editableRange.start) },
          {
            start: Math.min(source.length, editableRange.end),
            end: source.length,
          },
        ]
      : []),
  ]
    .filter(range => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<SourceRange[]>((merged, range) => {
      const previous = merged.at(-1)
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end)
      } else merged.push({ ...range })
      return merged
    }, [])
  let result = ''
  let index = 0

  for (const range of ranges) {
    result += transform(source.slice(index, range.start), index, source)
    result += source.slice(range.start, range.end)
    index = range.end
  }

  result += transform(source.slice(index), index, source)
  return result
}

function normalizeRegularText(text: string, start: number, source: string): string {
  return text
    .replace(
      /"([^"\r\n]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^"\r\n]*)"/gu,
      '“$1”',
    )
    .replace(/》 /gu, (match, offset: number) => {
      const absoluteOffset = start + offset
      return absoluteOffset === 0 || /[\r\n]/.test(source[absoluteOffset - 1])
        ? '> '
        : match
    })
}

function normalizePlainText(text: string, start: number, source: string): string {
  let result = ''
  let plainStart = 0
  let index = 0

  while (index < text.length) {
    const delimiter = text[index]
    if (delimiter !== '￥' && delimiter !== '·') {
      index += 1
      continue
    }

    const close = text.indexOf(delimiter, index + 1)
    const newline = text.slice(index + 1, close === -1 ? undefined : close).search(/[\r\n]/)
    if (close === -1 || newline !== -1) {
      index += 1
      continue
    }

    result += normalizeRegularText(
      text.slice(plainStart, index),
      start + plainStart,
      source,
    )
    const markdownDelimiter = delimiter === '￥' ? '$' : '`'
    result += markdownDelimiter + text.slice(index + 1, close) + markdownDelimiter
    index = close + 1
    plainStart = index
  }

  result += normalizeRegularText(text.slice(plainStart), start + plainStart, source)
  return result
}

export function normalizeCjkInput(
  source: string,
  editableRange?: SourceRange,
  autoSpacing = false,
  protectedRanges?: readonly SourceRange[],
): string {
  return transformMarkdownText(
    source,
    (text, start, fullSource) => {
      const normalized = normalizePlainText(text, start, fullSource)
      return autoSpacing ? spacePlainText(normalized) : normalized
    },
    editableRange,
    protectedRanges,
  )
}

function spacePlainText(source: string): string {
  const cjk = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}`
  return source
    .replace(new RegExp(`([${cjk}])([A-Za-z0-9])`, 'gu'), '$1 $2')
    .replace(new RegExp(`([A-Za-z0-9])([${cjk}])`, 'gu'), '$1 $2')
}

export function spaceCjkLatin(
  source: string,
  editableRange?: SourceRange,
): string {
  return transformMarkdownText(source, spacePlainText, editableRange)
}

function fallbackWordCount(source: string): number {
  return (
    source.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+/gu,
    )?.length ?? 0
  )
}

function fallbackCharacterCount(source: string): number {
  return source.match(/\P{Mark}\p{Mark}*/gu)?.length ?? 0
}

export function documentStats(source: string): DocumentStats {
  const frontMatter = collectPresentationRanges(source).find(
    (range) => range.start === 0,
  )?.end ?? 0
  const tree = parseMarkdownAst(source)
  const readableBlocks: string[] = []
  for (const block of tree.children) {
    const pieces: string[] = []
    const visit = (node: MarkdownNode) => {
      const start = node.position?.start.offset
      if (
        (start !== undefined && start < frontMatter) ||
        protectedNodeTypes.has(node.type) ||
        node.type === 'definition' ||
        node.type === 'footnoteDefinition'
      ) return
      if (node.type === 'text' && node.value) pieces.push(node.value)
      node.children?.forEach(visit)
    }
    visit(block)
    const text = pieces.join('').trim()
    if (text) readableBlocks.push(text)
  }
  const readable = readableBlocks.join('\n')
  const Segmenter = Intl.Segmenter
  let words: number
  let characters: number

  if (typeof Segmenter === 'function') {
    const wordSegmenter = new Segmenter('zh', { granularity: 'word' })
    const characterSegmenter = new Segmenter('zh', { granularity: 'grapheme' })

    words = Array.from(wordSegmenter.segment(readable)).filter(
      (segment) => segment.isWordLike,
    ).length
    characters = Array.from(characterSegmenter.segment(readable)).length
  } else {
    words = fallbackWordCount(readable)
    characters = fallbackCharacterCount(readable)
  }

  return {
    words,
    characters,
    readingMinutes: words === 0 ? 0 : Math.ceil(words / 200),
  }
}
