import { describe, expect, it } from 'vitest'

import { parseBlocks, renderMarkdown } from './markdown'

describe('parseBlocks', () => {
  it('preserves exact source slices and offsets for top-level blocks', () => {
    const source = '# 标题  \r\n\r\n- first\r\n  continued\r\n- second\r\n\r\n```ts\r\nconst n = 1\r\n```\r\n'

    const blocks = parseBlocks(source)

    expect(blocks.map(({ type, source: blockSource }) => ({ type, source: blockSource }))).toEqual([
      { type: 'heading', source: '# 标题  ' },
      { type: 'list', source: '- first\r\n  continued\r\n- second' },
      { type: 'code', source: '```ts\r\nconst n = 1\r\n```' },
    ])
    for (const block of blocks) {
      expect(source.slice(block.start, block.end)).toBe(block.source)
    }
  })
})

describe('renderMarkdown', () => {
  it('renders GFM tables', async () => {
    const html = await renderMarkdown('| Name | Value |\n| --- | ---: |\n| Qingshu | 2 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<td align="right">2</td>')
  })

  it('renders GFM task lists', async () => {
    const html = await renderMarkdown('- [x] shipped\n- [ ] pending')

    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
    expect(html).toContain('pending')
  })

  it('renders footnotes with references and definitions', async () => {
    const html = await renderMarkdown('A note.[^1]\n\n[^1]: Footnote text.')

    expect(html).toContain('data-footnote-ref')
    expect(html).toContain('Footnote text.')
    expect(html).toContain('data-footnotes')
  })

  it('renders inline and display math with KaTeX', async () => {
    const html = await renderMarkdown('Inline $E=mc^2$.\n\n$$\n\\int_0^1 x^2 dx\n$$')

    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('E')
    expect(html).toContain('∫')
  })

  it('sanitizes unsafe rendered HTML and protocols', async () => {
    const html = await renderMarkdown(
      '<script>alert("xss")</script>\n\n[bad](javascript:alert(1))\n\n![x](https://example.com/x.png)',
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('src="https://example.com/x.png"')
  })
})
