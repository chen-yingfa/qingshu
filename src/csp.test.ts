import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

it('permits HTTPS and blob images without broadening script policy', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const policy = html.match(/content="([^"]*img-src[^"]*)"/u)?.[1] ?? ''

  expect(policy).toContain("img-src 'self' data: blob: https:")
  expect(policy).toContain("script-src 'self'")
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
})
