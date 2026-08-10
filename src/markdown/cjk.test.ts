import { afterEach, describe, expect, it } from 'vitest'

import { documentStats, normalizeCjkInput, spaceCjkLatin } from './cjk'

const segmenterDescriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')

afterEach(() => {
  if (segmenterDescriptor) {
    Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor)
  }
})

describe('normalizeCjkInput', () => {
  it('converts CJK-friendly Markdown shortcuts without mutating its input', () => {
    const source = '》 引用\n￥E=mc^2￥ 和 ·const值·，以及 "中文"'

    expect(normalizeCjkInput(source)).toBe('> 引用\n$E=mc^2$ 和 `const值`，以及 “中文”')
    expect(source).toBe('》 引用\n￥E=mc^2￥ 和 ·const值·，以及 "中文"')
  })

  it('only converts the quote shortcut at the start of a line', () => {
    expect(normalizeCjkInput('正文 》 不转换\n  》 也不转换\n》 转换')).toBe(
      '正文 》 不转换\n  》 也不转换\n> 转换',
    )
  })

  it('does not normalize fenced code, inline code, or URLs', () => {
    const source = [
      '》 outside',
      '',
      '```md',
      '》 fenced',
      '￥fenced￥ ·fenced· "中文"',
      '```',
      '',
      '`》 inline ￥x￥ "中文"`',
      'https://example.com/￥x￥/中文',
    ].join('\n')

    const normalized = normalizeCjkInput(source)

    expect(normalized).toContain('> outside')
    expect(normalized).toContain('》 fenced\n￥fenced￥ ·fenced· "中文"')
    expect(normalized).toContain('`》 inline ￥x￥ "中文"`')
    expect(normalized).toContain('https://example.com/￥x￥/中文')
  })
})

describe('spaceCjkLatin', () => {
  it('inserts spaces between Han characters and Latin letters or digits', () => {
    expect(spaceCjkLatin('Qingshu编辑器支持React19和2026版本')).toBe(
      'Qingshu 编辑器支持 React19 和 2026 版本',
    )
  })

  it('does not add spaces inside fenced code, inline code, or URLs', () => {
    const source = [
      '正文React19',
      '`代码React19`',
      'https://example.com/中文React19',
      '~~~ts',
      'const版本React19 = true',
      '~~~',
    ].join('\n')

    const spaced = spaceCjkLatin(source)

    expect(spaced).toContain('正文 React19')
    expect(spaced).toContain('`代码React19`')
    expect(spaced).toContain('https://example.com/中文React19')
    expect(spaced).toContain('const版本React19 = true')
  })
})

describe('documentStats', () => {
  it('uses Intl.Segmenter for word and grapheme counts', () => {
    expect(documentStats('你好世界 hello 123')).toEqual({
      words: 4,
      characters: 14,
      readingMinutes: 1,
    })
  })

  it('uses a deterministic Unicode-aware fallback without Intl.Segmenter', () => {
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      value: undefined,
    })

    expect(documentStats('中文 test 42')).toEqual({
      words: 4,
      characters: 10,
      readingMinutes: 1,
    })
  })
})
