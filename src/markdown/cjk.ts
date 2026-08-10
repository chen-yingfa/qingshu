export interface DocumentStats {
  words: number
  characters: number
  readingMinutes: number
}

type TextTransform = (text: string) => string

interface Fence {
  marker: '`' | '~'
  length: number
}

const fenceStartPattern = /^ {0,3}(`{3,}|~{3,})/
const urlPattern = /^https?:\/\/[^\s<]+/iu

function transformInlineText(source: string, transform: TextTransform): string {
  let result = ''
  let plainStart = 0
  let index = 0

  const appendPlain = (end: number) => {
    result += transform(source.slice(plainStart, end))
  }

  while (index < source.length) {
    if (source[index] === '`') {
      let runEnd = index + 1
      while (source[runEnd] === '`') runEnd += 1

      const delimiter = source.slice(index, runEnd)
      const close = source.indexOf(delimiter, runEnd)
      appendPlain(index)

      if (close === -1) {
        result += source.slice(index)
        return result
      }

      const protectedEnd = close + delimiter.length
      result += source.slice(index, protectedEnd)
      index = protectedEnd
      plainStart = protectedEnd
      continue
    }

    const url = source.slice(index).match(urlPattern)?.[0]
    if (url) {
      appendPlain(index)
      result += url
      index += url.length
      plainStart = index
      continue
    }

    index += 1
  }

  appendPlain(source.length)
  return result
}

function transformMarkdownText(source: string, transform: TextTransform): string {
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? []
  let fence: Fence | undefined

  return lines
    .map((line) => {
      const content = line.replace(/(?:\r\n|\n|\r)$/, '')
      const ending = line.slice(content.length)

      if (fence) {
        const closingPattern = new RegExp(
          `^ {0,3}\\${fence.marker}{${fence.length},}[ \\t]*$`,
        )
        if (closingPattern.test(content)) fence = undefined
        return line
      }

      const opening = content.match(fenceStartPattern)?.[1]
      if (opening) {
        fence = {
          marker: opening[0] as Fence['marker'],
          length: opening.length,
        }
        return line
      }

      return transformInlineText(content, transform) + ending
    })
    .join('')
}

function normalizePlainText(source: string): string {
  return source
    .replace(/^》 /, '> ')
    .replace(/￥([^￥\r\n]*)￥/gu, '$$$1$')
    .replace(/·([^·\r\n]*)·/gu, '`$1`')
    .replace(
      /"([^"\r\n]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^"\r\n]*)"/gu,
      '“$1”',
    )
}

export function normalizeCjkInput(source: string): string {
  return transformMarkdownText(source, normalizePlainText)
}

function spacePlainText(source: string): string {
  return source
    .replace(/(\p{Script=Han})([A-Za-z0-9])/gu, '$1 $2')
    .replace(/([A-Za-z0-9])(\p{Script=Han})/gu, '$1 $2')
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
