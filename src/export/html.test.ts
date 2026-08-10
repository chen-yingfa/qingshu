import { describe, expect, it } from 'vitest'

import { createHtmlDocument } from './html'

describe('createHtmlDocument', () => {
  it('creates a complete standalone UTF-8 document with inlined local styling', async () => {
    const html = await createHtmlDocument(
      '# 你好 Qingshu\n\n| Feature | Ready |\n| --- | --- |\n| GFM | Yes |\n\n$E=mc^2$',
      '数学笔记.md',
    )

    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('<html lang="zh-CN">')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>数学笔记</title>')
    expect(html).toContain('<style>')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('@import')
    expect(html).not.toContain('url(')
  })

  it('contains rendered GFM and KaTeX rather than Markdown source', async () => {
    const html = await createHtmlDocument(
      '- [x] exported\n\n~~done~~\n\n$$\n\\int_0^1 x^2 dx\n$$',
    )

    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<del>done</del>')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('$$')
  })
})
