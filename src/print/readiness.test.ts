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
  vi.useRealTimers()
})

describe('waitForPrintReadiness', () => {
  it('waits for full render, fonts, and every current image load', async () => {
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

    broken.dispatchEvent(new Event('load'))
    await waiting
    expect(ready).toBe(true)
  })

  it('rejects failed images and marks them visibly for preview and PDF', async () => {
    const root = document.createElement('div')
    const broken = document.createElement('img')
    broken.alt = 'Architecture diagram'
    Object.defineProperty(broken, 'complete', { configurable: true, value: false })
    root.append(broken)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    })

    const waiting = waitForPrintReadiness(Promise.resolve(), root)
    await Promise.resolve()
    broken.dispatchEvent(new Event('error'))

    await expect(waiting).rejects.toThrow(
      'Failed to load image "Architecture diagram" before PDF export',
    )
    expect(broken.dataset.imageError).toBe('true')
    expect(broken.title).toContain('Failed to load image')
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

  it('rejects after a bounded timeout when an image never settles', async () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    const pending = document.createElement('img')
    Object.defineProperty(pending, 'complete', { configurable: true, value: false })
    root.append(pending)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    })

    const waiting = waitForPrintReadiness(Promise.resolve(), root, {
      imageTimeoutMs: 500,
    })
    const rejected = expect(waiting).rejects.toThrow(
      'Timed out waiting for 1 image before PDF export',
    )
    await vi.advanceTimersByTimeAsync(500)

    await rejected
  })

  it('cancels pending readiness and removes image listeners', async () => {
    const root = document.createElement('div')
    const pending = document.createElement('img')
    Object.defineProperty(pending, 'complete', { configurable: true, value: false })
    root.append(pending)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    })
    const controller = new AbortController()

    const waiting = waitForPrintReadiness(Promise.resolve(), root, {
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort()

    await expect(waiting).rejects.toThrow('PDF export readiness was canceled')
  })
})
