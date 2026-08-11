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

  it('pins workspace rows for horizontal, vertical, and focus tab layouts', () => {
    expect(styles).toMatch(/\.title-bar\s*\{[^}]*grid-row:\s*1;/su)
    expect(styles).toMatch(/\.toolbar\s*\{[^}]*grid-row:\s*2;/su)
    expect(styles).toMatch(
      /\.tab-strip-horizontal\s*\{[^}]*grid-row:\s*3;/su,
    )
    expect(styles).toMatch(/\.workspace-layout\s*\{[^}]*grid-row:\s*4;/su)
    expect(styles).toMatch(/\.status-bar\s*\{[^}]*grid-row:\s*5;/su)
    expect(styles).toMatch(
      /\.tabs-vertical\s*\{[^}]*grid-template-rows:\s*38px 46px 0 minmax\(0,\s*1fr\) 30px;/su,
    )
    expect(styles).toMatch(
      /\.focus-mode\s*\{[^}]*grid-template-rows:\s*0 0 0 minmax\(0,\s*1fr\) 0;/su,
    )
  })
})
