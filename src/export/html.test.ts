import { describe, expect, it } from 'vitest'

import { canonicalFootnoteId } from '../markdown/markdown'
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

  it('includes visible syntax colors for rendered fenced code', async () => {
    const html = await createHtmlDocument(
      '```python\ndef greet(name):\n    return f"Hello {name}"\n```',
    )

    expect(html).toContain('class="hljs language-python"')
    expect(html).toContain('class="hljs-keyword">def</span>')
    expect(html).toContain('.hljs-keyword')
    expect(html).toContain('.hljs-string')
  })

  it('keeps cross-block footnotes linked when exporting the full source', async () => {
    const html = await createHtmlDocument(
      'First block references a note.[^shared]\n\nSecond block.\n\n[^shared]: Shared footnote.',
    )

    const id = canonicalFootnoteId('shared')
    expect(html).toContain(`href="#user-content-fn-${id}"`)
    expect(html).toContain(`id="user-content-fn-${id}"`)
    expect(html).toContain('Shared footnote.')
  })

  it('exports complex equations as accessible MathML without KaTeX font assets', async () => {
    const html = await createHtmlDocument(
      '$$\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}$$',
    )

    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"')
    expect(html).toContain('<annotation encoding="application/x-tex">')
    expect(html).toContain('.katex-html{display:none}')
    expect(html).not.toMatch(/KaTeX_(?:Main|Math|Size|AMS|Caligraphic)/)
    expect(html).not.toMatch(/\.(?:woff2?|ttf|otf)/)
    expect(html).not.toContain('url(')
  })
})
