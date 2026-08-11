/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const entry = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf8')
const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
)

describe('KaTeX application styling', () => {
  it('loads bundled KaTeX typography instead of replacing it with native MathML', () => {
    expect(entry).toContain("katex/dist/katex.min.css")
    expect(styles).not.toMatch(/\.rendered-block \.katex-html\s*\{\s*display:\s*none/)
    expect(styles).not.toMatch(/\.rendered-block \.katex\s*\{\s*font:\s*inherit/)
  })

  it('scales superscript and subscript content below surrounding math', () => {
    expect(styles).toMatch(
      /\.katex \.msupsub \.size3\s*\{[^}]*font-size:\s*0\.6em;/su,
    )
  })
})
