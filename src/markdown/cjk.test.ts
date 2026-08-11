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

  it('protects indented, container-fenced, and multiline CommonMark code', () => {
    const source = [
      '    》 indented ￥x￥ ·x· "中文"',
      '',
      '> ```md',
      '> 》 quoted ￥x￥ "中文"',
      '> ```',
      '',
      '- ~~~md',
      '  》 listed ￥x￥ "中文"',
      '  ~~~',
      '',
      '``multiline ￥x￥',
      '"中文"`` and "正文"',
    ].join('\n')

    const normalized = normalizeCjkInput(source)

    expect(normalized).toContain('    》 indented ￥x￥ ·x· "中文"')
    expect(normalized).toContain('> 》 quoted ￥x￥ "中文"')
    expect(normalized).toContain('  》 listed ￥x￥ "中文"')
    expect(normalized).toContain('``multiline ￥x￥\n"中文"``')
    expect(normalized).toContain('and “正文”')
  })

  it('does not treat unmatched backticks as code', () => {
    expect(normalizeCjkInput('未闭合 ` marker 后 "中文"')).toBe(
      '未闭合 ` marker 后 “中文”',
    )
  })

  it('does not re-transform code or math emitted by shortcuts', () => {
    const normalized = normalizeCjkInput('·"中文A"· ￥"中文A"￥ "中文A"')

    expect(normalized).toBe('`"中文A"` $"中文A"$ “中文A”')
    expect(spaceCjkLatin(normalized)).toBe('`"中文A"` $"中文A"$ “中文 A”')
  })

  it('protects Markdown destinations while transforming visible labels', () => {
    const source = [
      '[标签 "中文"](./路径/￥x￥)',
      '![图片 "中文"](../资源/·x·.png)',
      '[邮件 "中文"](mailto:用户￥x￥@example.com)',
      '[引用 "中文"][id]',
      '',
      '[id]: ./定义/￥x￥',
      '<mailto:用户￥x￥@example.com>',
      '<https://example.com/路径/￥x￥>',
      'www.example.com/路径/￥x￥',
    ].join('\n')

    const normalized = normalizeCjkInput(source)

    expect(normalized).toContain('[标签 “中文”](./路径/￥x￥)')
    expect(normalized).toContain('![图片 “中文”](../资源/·x·.png)')
    expect(normalized).toContain('[邮件 “中文”](mailto:用户￥x￥@example.com)')
    expect(normalized).toContain('[引用 “中文”][id]')
    expect(normalized).toContain('[id]: ./定义/￥x￥')
    expect(normalized).toContain('<mailto:用户￥x￥@example.com>')
    expect(normalized).toContain('<https://example.com/路径/￥x￥>')
    expect(normalized).toContain('www.example.com/路径/￥x￥')
  })

  it('preserves realistic Marp front matter, directives, and HTML', () => {
    const source = [
      '---',
      'marp: true',
      'theme: 中文Theme',
      'title: "中文A"',
      '---',
      '<!-- _class: 中文Lead -->',
      '<!-- paginate: true中文 -->',
      '<div class="中文Card">组件React19</div>',
      '',
      '# 正文React19 "中文"',
    ].join('\n')

    expect(normalizeCjkInput(source)).toBe(
      source.replace('# 正文React19 "中文"', '# 正文React19 “中文”'),
    )
    expect(spaceCjkLatin(source)).toBe(
      source.replace('# 正文React19 "中文"', '# 正文 React19 "中文"'),
    )
  })

  it('preserves realistic Slidev TOML front matter, directives, and components', () => {
    const source = [
      '+++',
      'theme = "中文Theme"',
      'layout = "中文Layout"',
      '+++',
      '::right::',
      '<Tweet id="中文A" />',
      '<My组件 title="中文A">',
      '组件React19',
      '</My组件>',
      '',
      '正文Vue3 "中文"',
    ].join('\n')

    expect(normalizeCjkInput(source)).toBe(
      source.replace('正文Vue3 "中文"', '正文Vue3 “中文”'),
    )
    expect(spaceCjkLatin(source)).toBe(
      source.replace('正文Vue3 "中文"', '正文 Vue3 "中文"'),
    )
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

  it('spaces Han, Hiragana, Katakana, and Hangul next to Latin text', () => {
    expect(spaceCjkLatin('中文A かなB カナC 한글D')).toBe(
      '中文 A かな B カナ C 한글 D',
    )
  })

  it('protects every CommonMark code form but transforms unmatched backticks', () => {
    const source = [
      '    中文A',
      '',
      '> ```',
      '> 中文A',
      '> ```',
      '',
      '- ~~~',
      '  カナB',
      '  ~~~',
      '',
      '``한글C',
      '中文D`` outside中文E',
      '',
      'unmatched ` marker中文F',
    ].join('\n')

    const spaced = spaceCjkLatin(source)

    expect(spaced).toContain('    中文A')
    expect(spaced).toContain('> 中文A')
    expect(spaced).toContain('  カナB')
    expect(spaced).toContain('``한글C\n中文D`` outside 中文 E')
    expect(spaced).toContain('unmatched ` marker 中文 F')
  })

  it('protects inline, image, reference, autolink, mailto, and www destinations', () => {
    const source = [
      '[标签A](./路径A)',
      '![图片A](../资源A.png)',
      '[邮件A](mailto:用户A@example.com)',
      '[网站A](www.example.com/路径A)',
      '[引用A][id]',
      '',
      '[id]: ./定义A',
      '<mailto:用户A@example.com>',
      '<https://example.com/路径A>',
      'www.example.com/路径A',
    ].join('\n')

    const spaced = spaceCjkLatin(source)

    expect(spaced).toContain('[标签 A](./路径A)')
    expect(spaced).toContain('![图片 A](../资源A.png)')
    expect(spaced).toContain('[邮件 A](mailto:用户A@example.com)')
    expect(spaced).toContain('[网站 A](www.example.com/路径A)')
    expect(spaced).toContain('[引用 A][id]')
    expect(spaced).toContain('[id]: ./定义A')
    expect(spaced).toContain('<mailto:用户A@example.com>')
    expect(spaced).toContain('<https://example.com/路径A>')
    expect(spaced).toContain('www.example.com/路径A')
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

  it('counts readable prose rather than front matter, code, URLs, or Markdown syntax', () => {
    const source = [
      '---',
      'title: Hidden Metadata',
      '---',
      '# Visible **words**',
      '',
      'Read [the guide](https://example.com/long/path) now.',
      '',
      '```ts',
      'const hidden = 123',
      '```',
    ].join('\n')

    expect(documentStats(source)).toEqual({
      words: 6,
      characters: 33,
      readingMinutes: 1,
    })
  })
})
