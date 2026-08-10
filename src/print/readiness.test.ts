// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { waitForPrintReadiness } from './readiness'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('waitForPrintReadiness', () => {
  it('waits for full render, fonts, and every current image load or error', async () => {
    const render = deferred()
    const fonts = deferred()
    const root = document.createElement('div')
    const loaded = document.createElement('img')
    const broken = document.createElement('img')
    Object.defineProperty(loaded, 'complete', { configurable: true, value: false })
    Object.defineProperty(broken, 'complete', { configurable: true, value: false })
    root.append(loaded, broken)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fonts.promise },
    })

    let ready = false
    const waiting = waitForPrintReadiness(render.promise, root).then(() => {
      ready = true
    })
    await Promise.resolve()
    expect(ready).toBe(false)

    render.resolve()
    await Promise.resolve()
    expect(ready).toBe(false)

    fonts.resolve()
    await Promise.resolve()
    expect(ready).toBe(false)

    loaded.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(ready).toBe(false)

    broken.dispatchEvent(new Event('error'))
    await waiting
    expect(ready).toBe(true)
  })

  it('does not wait for images already complete or a missing FontFaceSet', async () => {
    const root = document.createElement('div')
    const complete = document.createElement('img')
    Object.defineProperty(complete, 'complete', { configurable: true, value: true })
    root.append(complete)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    })

    await expect(waitForPrintReadiness(Promise.resolve(), root)).resolves.toBeUndefined()
  })
})
