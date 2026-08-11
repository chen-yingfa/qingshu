import { describe, expect, it } from 'vitest'

import entry from './main.tsx?raw'
import styles from './styles.css?raw'

describe('KaTeX application styling', () => {
  it('loads bundled KaTeX typography instead of replacing it with native MathML', () => {
    expect(entry).toContain("katex/dist/katex.min.css")
    expect(styles).not.toMatch(/\.rendered-block \.katex-html\s*\{\s*display:\s*none/)
    expect(styles).not.toMatch(/\.rendered-block \.katex\s*\{\s*font:\s*inherit/)
  })
})
