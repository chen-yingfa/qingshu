import { describe, expect, it } from 'vitest'

import { highlightCode, parseFencedCode } from './code'

describe('fenced code preview', () => {
  it('parses CRLF fences and language info without carriage returns', () => {
    expect(parseFencedCode('```ts\r\nconst value = 1\r\n```')).toEqual({
      fence: '```',
      language: 'typescript',
      code: 'const value = 1',
      closed: true,
    })
  })

  it('escapes unknown languages without expensive auto-detection', () => {
    expect(highlightCode('<script>alert("x")</script>', 'custom-language')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
  })

  it('skips grammar highlighting for very large known-language blocks', () => {
    const source = `const value = "<unsafe>";\n${'x'.repeat(100_000)}`
    const html = highlightCode(source, 'typescript')

    expect(html).toContain('&lt;unsafe&gt;')
    expect(html).not.toContain('<span')
  })
})
