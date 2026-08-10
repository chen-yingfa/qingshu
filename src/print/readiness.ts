export const DEFAULT_IMAGE_TIMEOUT_MS = 15_000

export interface PrintReadinessOptions {
  imageTimeoutMs?: number
  signal?: AbortSignal
}

function cancellationError(): Error {
  return new Error('PDF export readiness was canceled')
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(cancellationError())
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      reject(cancellationError())
    }
    signal.addEventListener('abort', cancel, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      },
    )
  })
}

function waitForImages(
  images: HTMLImageElement[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const pending = new Set(images.filter((image) => !image.complete))
  if (pending.size === 0) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const listeners = new Map<HTMLImageElement, () => void>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      for (const [image, finish] of listeners) {
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
      }
      listeners.clear()
    }
    const succeed = () => {
      cleanup()
      resolve()
    }
    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cancel = () => fail(cancellationError())

    if (signal?.aborted) {
      cancel()
      return
    }
    signal?.addEventListener('abort', cancel, { once: true })

    for (const image of pending) {
      const finish = () => {
        pending.delete(image)
        if (pending.size === 0) succeed()
      }
      listeners.set(image, finish)
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
      if (image.complete) finish()
    }

    if (pending.size > 0) {
      timer = setTimeout(() => {
        const count = pending.size
        fail(
          new Error(
            `Timed out waiting for ${count} ${count === 1 ? 'image' : 'images'} before PDF export`,
          ),
        )
      }, timeoutMs)
    }
  })
}

export async function waitForPrintReadiness(
  renderReady: Promise<void>,
  root: ParentNode = document,
  {
    imageTimeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
    signal,
  }: PrintReadinessOptions = {},
): Promise<void> {
  await abortable(renderReady, signal)
  const timeout = Number.isFinite(imageTimeoutMs)
    ? Math.max(0, imageTimeoutMs)
    : DEFAULT_IMAGE_TIMEOUT_MS
  const imagesReady = waitForImages(
    Array.from(root.querySelectorAll('img')),
    timeout,
    signal,
  )
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  await Promise.all([
    imagesReady,
    fonts ? abortable(fonts.ready, signal) : Promise.resolve(),
  ])
}
