/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
)

describe('writing surface appearance', () => {
  it('uses one white light canvas inside and outside the paper', () => {
    expect(styles).toMatch(/--bg:\s*#fff;/u)
    expect(styles).toMatch(/--paper:\s*#fff;/u)
    expect(styles).toMatch(/--chrome:\s*rgba\(255,\s*255,\s*255/u)
  })

  it('applies the configured document font-size variable', () => {
    expect(styles).toContain(
      'font-size: var(--document-font-size, 17px);',
    )
  })
})
