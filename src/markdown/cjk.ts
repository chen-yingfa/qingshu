import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface DocumentStats {
  words: number
  characters: number
  readingMinutes: number
}

type TextTransform = (text: string, start: number, source: string) => string

interface SourceRange {
  start: number
  end: number
}

interface MarkdownNode {
  type: string
  url?: string
  children?: MarkdownNode[]
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }
}

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const protectedNodeTypes = new Set(['code', 'inlineCode', 'math', 'inlineMath'])

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

function collectProtectedRanges(source: string): SourceRange[] {
  const tree = markdownParser.parse(source) as MarkdownNode
  const ranges: SourceRange[] = []

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

function transformMarkdownText(source: string, transform: TextTransform): string {
  const ranges = collectProtectedRanges(source)
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

export function normalizeCjkInput(source: string): string {
  return transformMarkdownText(source, normalizePlainText)
}

function spacePlainText(source: string): string {
  const cjk = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}`
  return source
    .replace(new RegExp(`([${cjk}])([A-Za-z0-9])`, 'gu'), '$1 $2')
    .replace(new RegExp(`([A-Za-z0-9])([${cjk}])`, 'gu'), '$1 $2')
}

export function spaceCjkLatin(source: string): string {
  return transformMarkdownText(source, spacePlainText)
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
  const Segmenter = Intl.Segmenter
  let words: number
  let characters: number

  if (typeof Segmenter === 'function') {
    const wordSegmenter = new Segmenter('zh', { granularity: 'word' })
    const characterSegmenter = new Segmenter('zh', { granularity: 'grapheme' })

    words = Array.from(wordSegmenter.segment(source)).filter(
      (segment) => segment.isWordLike,
    ).length
    characters = Array.from(characterSegmenter.segment(source)).length
  } else {
    words = fallbackWordCount(source)
    characters = fallbackCharacterCount(source)
  }

  return {
    words,
    characters,
    readingMinutes: words === 0 ? 0 : Math.ceil(words / 200),
  }
}
