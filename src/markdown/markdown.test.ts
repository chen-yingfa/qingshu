import { describe, expect, it } from 'vitest'

import {
  canonicalFootnoteId,
  createDocumentRenderContext,
  hasRenderableMath,
  parseDocument,
  parseBlocks,
  renderDocumentFootnotes,
  renderMarkdown,
  renderMarkdownBlock,
} from './markdown'

describe('parseBlocks', () => {
  it('parses YAML frontmatter as one exact protected block', () => {
    const source =
      '---\ntitle: 你好 Qingshu\ntags:\n  - markdown\n---\n\n# Document'
    const blocks = parseBlocks(source)

    expect(blocks[0]).toMatchObject({
      type: 'yaml',
      source: '---\ntitle: 你好 Qingshu\ntags:\n  - markdown\n---',
      start: 0,
    })
    expect(blocks[1]).toMatchObject({
      type: 'heading',
      source: '# Document',
    })
  })

  it('parses TOML frontmatter as one exact protected block', () => {
    const source = '+++\ntitle = "Qingshu"\ndraft = false\n+++\n\nBody'
    const blocks = parseBlocks(source)

    expect(blocks[0]).toMatchObject({
      type: 'toml',
      source: '+++\ntitle = "Qingshu"\ndraft = false\n+++',
    })
  })

  it('preserves BOM and CRLF offsets across frontmatter and content blocks', () => {
    const source =
      '\uFEFF---\r\ntitle: Qingshu  \r\n---\r\n\r\n# Heading\r\n\r\nBody'
    const blocks = parseBlocks(source)

    expect(blocks.map((block) => block.source)).toEqual([
      '\uFEFF---\r\ntitle: Qingshu  \r\n---',
      '# Heading',
      'Body',
    ])
    for (const block of blocks) {
      expect(source.slice(block.start, block.end)).toBe(block.source)
    }
  })

  it('leaves unclosed frontmatter delimiters as ordinary Markdown', () => {
    const blocks = parseBlocks('---\ntitle: Not closed\n\n# Heading')

    expect(blocks[0].type).not.toBe('yaml')
    expect(blocks.map((block) => block.source).join('\n')).toContain(
      'title: Not closed',
    )
  })

  it('retains blank-line-separated items as one semantic loose list', () => {
    const blocks = parseBlocks('- Previous item\n\n-')

    expect(blocks.map(({ type, source }) => ({ type, source }))).toEqual([
      { type: 'list', source: '- Previous item\n\n-' },
    ])
  })

  it('keeps adjacent items in one tight list block', () => {
    const blocks = parseBlocks('- First\n- Second')

    expect(blocks.map(({ type, source }) => ({ type, source }))).toEqual([
      { type: 'list', source: '- First\n- Second' },
    ])
  })

  it('renders loose ordered items as one semantic list', async () => {
    const html = await renderMarkdown('3. alpha\n\n9. beta')

    expect(html.match(/<ol/g)).toHaveLength(1)
    expect(html.match(/<li/g)).toHaveLength(2)
  })

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

  it('keeps an unchanged block identity stable when preceding text changes length', () => {
    const before = parseBlocks('First\n\nSecond\n\nThird')
    const after = parseBlocks('A much longer first block\n\nSecond\n\nThird')

    expect(after[1].id).toBe(before[1].id)
    expect(after[2].id).toBe(before[2].id)
  })
})

describe('renderMarkdown', () => {
  it('omits frontmatter metadata from rendered document output', async () => {
    const html = await renderMarkdown(
      '---\ntitle: Secret metadata\n---\n\n# Visible title',
    )

    expect(html).not.toContain('Secret metadata')
    expect(html).not.toContain('<hr')
    expect(html).toContain('<h1>Visible title</h1>')
  })

  it('omits TOML frontmatter from rendered output', async () => {
    const html = await renderMarkdown(
      '+++\ntitle = "Private"\n+++\n\nVisible body',
    )

    expect(html).not.toContain('Private')
    expect(html).toContain('<p>Visible body</p>')
  })

  it('distinguishes currency prose from semantic inline and display math', () => {
    expect(hasRenderableMath('Price is $5 and $10')).toBe(false)
    expect(hasRenderableMath('Inline $E=mc^2$.')).toBe(true)
    expect(hasRenderableMath('$$\nE=mc^2\n$$')).toBe(true)
  })

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

  it('syntax-highlights fenced code in rendered Markdown blocks', async () => {
    const html = await renderMarkdown(
      '```python\ndef bin_search(values, target):\n    return target in values\n```',
    )

    expect(html).toContain('class="hljs language-python"')
    expect(html).toContain('class="hljs-keyword">def</span>')
    expect(html).toContain('class="hljs-keyword">return</span>')
  })

  it('uses the same language aliases in active and rendered code previews', async () => {
    const html = await renderMarkdown('```shell\nif true; then echo ready; fi\n```')

    expect(html).toContain('class="hljs language-shell"')
    expect(html).toContain('class="hljs-keyword">if</span>')
    expect(html).toContain('class="hljs-keyword">then</span>')
  })

  it('leaves inline code plain and escapes hostile fenced-code content', async () => {
    const html = await renderMarkdown(
      'Inline `const value`.\n\n```custom\n<script>alert("x")</script>\n```',
    )

    expect(html).toContain('<p>Inline <code>const value</code>.</p>')
    expect(html).toContain(
      '<code class="hljs language-custom">&#x3C;script>alert("x")&#x3C;/script>',
    )
    expect(html).not.toContain('<script>')
  })

  it('preserves scalable delimiters, blackboard symbols, and scripts in KaTeX HTML', async () => {
    const html = await renderMarkdown(
      '$$\\left(\\frac{x_t}{\\mathbb R}\\right) \\in \\mathbb N_0$$',
    )

    expect(html).toContain('class="mopen delimcenter"')
    expect(html).toContain('class="mfrac"')
    expect(html).toContain('mathbb')
    expect(html).toContain('msupsub')
  })

  it('sanitizes unsafe rendered HTML and protocols', async () => {
    const html = await renderMarkdown(
      '<script>alert("xss")</script>\n\n[bad](javascript:alert(1))\n\n![x](https://example.com/x.png)',
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('src="https://example.com/x.png"')
  })

  it('performs a final sanitization after highlighting and KaTeX expansion', async () => {
    const html = await renderMarkdown(
      '```html\n<img src=x onerror=alert(1)>\n```\n\n$<img src=x onerror=alert(1)>$',
    )

    expect(html).not.toMatch(/<[^>]+\sonerror=/u)
    expect(html).not.toContain('<script')
    expect(html).toContain('class="hljs language-html"')
    expect(html).toContain('class="katex"')
    expect(html).toContain('<math')
  })

  it('allows HTTPS and blob image sources but rejects active protocols', async () => {
    const html = await renderMarkdown(
      '![remote](https://example.com/a.png)\n\n![blob](blob:https://example.com/id)\n\n![bad](javascript:alert(1))',
    )

    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('src="blob:https://example.com/id"')
    expect(html).not.toContain('javascript:')
  })

  it('resolves reference links from definitions in another block', async () => {
    const source = '[Qingshu][site]\n\n[site]: https://example.com "Home"'
    const block = parseBlocks(source)[0]
    const context = createDocumentRenderContext(source)

    await expect(renderMarkdownBlock(block, context)).resolves.toContain(
      '<a href="https://example.com" title="Home">Qingshu</a>',
    )
  })

  it('renders one document footnote section with globally unique reference IDs', async () => {
    const source =
      'First[^note]\n\nSecond[^note]\n\n[^note]: Shared **footnote**.'
    const blocks = parseBlocks(source)
    const context = createDocumentRenderContext(source)
    const first = await renderMarkdownBlock(blocks[0], context)
    const second = await renderMarkdownBlock(blocks[1], context)
    const footnotes = await renderDocumentFootnotes(context)

    const id = canonicalFootnoteId('note')
    expect(first).toContain(`id="user-content-fnref-${id}"`)
    expect(second).toContain(`id="user-content-fnref-${id}-2"`)
    expect(first).not.toContain('data-footnotes')
    expect(second).not.toContain('data-footnotes')
    expect(footnotes.match(/data-footnotes/g)).toHaveLength(1)
    expect(footnotes).toContain('Shared <strong>footnote</strong>.')
    expect(footnotes).toContain(`href="#user-content-fnref-${id}"`)
    expect(footnotes).toContain(`href="#user-content-fnref-${id}-2"`)
  })

  it('derives footnote ordinals only from AST footnoteReference nodes', async () => {
    const source = [
      '---',
      'title: "[^front-matter]"',
      '---',
      'First[^real] and `[^inline-code]` and \\[^escaped].',
      '',
      '```md',
      '[^fenced-code]',
      '```',
      '',
      '<!-- [^html-comment] -->',
      '',
      'Second[^real].',
      '',
      '[^real]: Actual note.',
    ].join('\n')
    const model = parseDocument(source)
    const rendered = await Promise.all(
      model.blocks.map((block) => renderMarkdownBlock(block, model.renderContext)),
    )

    expect(model.renderContext.references).toHaveLength(2)
    const id = canonicalFootnoteId('real')
    expect(rendered.join('\n')).toContain(`id="user-content-fnref-${id}"`)
    expect(rendered.join('\n')).toContain(`id="user-content-fnref-${id}-2"`)
    expect(rendered.join('\n')).not.toContain('fnref-front-matter')
    expect(rendered.join('\n')).not.toContain('fnref-inline-code')
    expect(rendered.join('\n')).not.toContain('fnref-fenced-code')
    expect(rendered.join('\n')).not.toContain('fnref-html-comment')
  })

  it('uses collision-resistant HTML-safe IDs for hostile footnote labels', async () => {
    const source = [
      'Quote[^"><svg/onload=alert(1)>].',
      'Unicode[^雪].',
      'Dash[^a-b].',
      'Underscore[^a_b].',
      '',
      '[^"><svg/onload=alert(1)>]: Hostile.',
      '[^雪]: Snow.',
      '[^a-b]: Dash.',
      '[^a_b]: Underscore.',
    ].join('\n')
    const model = parseDocument(source)
    const body = (
      await Promise.all(
        model.blocks.map((block) =>
          renderMarkdownBlock(block, model.renderContext),
        ),
      )
    ).join('')
    const footnotes = await renderDocumentFootnotes(model.renderContext)
    const html = body + footnotes

    expect(model.renderContext.references).toHaveLength(4)
    expect(canonicalFootnoteId('雪')).toBe('cp-96ea')
    expect(canonicalFootnoteId('a-b')).not.toBe(canonicalFootnoteId('a_b'))
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('onload')
    expect(html).not.toContain('id="user-content-fnref-&quot;')

    const targets = [...html.matchAll(/data-footnote-ref=""[^>]*|<a href="(#[^"]+)"/gu)]
      .map((match) => match[1])
      .filter(Boolean)
    for (const target of targets) {
      expect(html).toContain(`id="${target.slice(1)}"`)
    }
    for (const reference of model.renderContext.references) {
      expect(html).toContain(canonicalFootnoteId(reference.identifier))
    }
  })

  it('leaves ordinary footnote-shaped fragments untouched beside semantic footnotes', async () => {
    const hostile = '"><tag>'
    const source = [
      '[ordinary](#user-content-fn-manual)',
      '[ordinary backlink](#user-content-fnref-manual)',
      `Hostile[^${hostile}] and Unicode[^雪].`,
      '',
      `[^${hostile}]: Hostile note.`,
      '[^雪]: Unicode note.',
    ].join('\n')
    const html = await renderMarkdown(source)
    const hostileId = canonicalFootnoteId(hostile)
    const unicodeId = canonicalFootnoteId('雪')

    expect(html).toContain('href="#user-content-fn-manual"')
    expect(html).toContain('href="#user-content-fnref-manual"')
    expect(html).toContain(`href="#user-content-fn-${hostileId}"`)
    expect(html).toContain(`id="user-content-fn-${hostileId}"`)
    expect(html).toContain(`href="#user-content-fn-${unicodeId}"`)
    expect(html).toContain(`id="user-content-fn-${unicodeId}"`)
    expect(html).toContain(`href="#user-content-fnref-${hostileId}"`)
    expect(html).toContain(`href="#user-content-fnref-${unicodeId}"`)
  })
})
