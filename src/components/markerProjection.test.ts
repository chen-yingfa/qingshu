import { describe, expect, it } from 'vitest'

import { createMarkerProjection } from './markerProjection'

describe('marker projection', () => {
  it.each([
    ['- prose', 'prose'],
    ['* prose', 'prose'],
    ['+ prose', 'prose'],
    ['007. prose', 'prose'],
    ['09) prose', 'prose'],
    ['- [x] done', 'done'],
    ['+ [ ] pending', 'pending'],
  ])('hides the first list marker in %s', (canonical, visible) => {
    const projection = createMarkerProjection(canonical, 'list')

    expect(projection.visible).toBe(visible)
    expect(projection.toCanonicalOffset(0)).toBe(canonical.length - visible.length)
    expect(projection.toVisibleOffset(canonical.length - visible.length - 1)).toBe(0)
    expect(projection.toVisibleOffset(canonical.length)).toBe(visible.length)
  })

  it('keeps nested child source visible and reconstructs the exact parent marker', () => {
    const canonical = '007) parent\r\n\t* child\r\n\t  continuation'
    const projection = createMarkerProjection(canonical, 'list')

    expect(projection.visible).toBe('parent\r\n\t* child\r\n\t  continuation')
    expect(projection.applyVisibleEdit('changed\r\n\t* child\r\n\t  continuation')).toBe(
      '007) changed\r\n\t* child\r\n\t  continuation',
    )
  })

  it('hides every quote prefix and preserves nested depth and CRLF', () => {
    const canonical = '> one\r\n>> two\r\n> > three'
    const projection = createMarkerProjection(canonical, 'quote')

    expect(projection.visible).toBe('one\r\ntwo\r\nthree')
    expect(projection.applyVisibleEdit('ONE\r\ntwo\r\nthree')).toBe(
      '> ONE\r\n>> two\r\n> > three',
    )
  })

  it('continues the current quote prefix for inserted lines', () => {
    const projection = createMarkerProjection('>> nested', 'quote')

    expect(projection.applyVisibleEdit('nested\nnext')).toBe(
      '>> nested\n>> next',
    )
  })

  it('maps quote offsets in both directions at line boundaries', () => {
    const projection = createMarkerProjection('> one\n>> two', 'quote')

    expect(projection.toCanonicalOffset(0)).toBe(2)
    expect(projection.toCanonicalOffset(4)).toBe(9)
    expect(projection.toCanonicalOffset(5)).toBe(10)
    expect(projection.toVisibleOffset(7)).toBe(4)
    expect(projection.toVisibleOffset(9)).toBe(4)
  })

  it('is identity for plain text and marker-shaped protected content', () => {
    for (const source of ['- item', '> quote', '---\ntitle: x\n---', '```md\n- code\n```']) {
      const projection = createMarkerProjection(source, 'plain')
      expect(projection.visible).toBe(source)
      expect(projection.applyVisibleEdit(`${source}!`)).toBe(`${source}!`)
      expect(projection.toCanonicalOffset(2)).toBe(2)
      expect(projection.toVisibleOffset(2)).toBe(2)
    }
  })
})
