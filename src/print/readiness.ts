function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = () => {
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
    if (image.complete) finish()
  })
}

export async function waitForPrintReadiness(
  renderReady: Promise<void>,
  root: ParentNode = document,
): Promise<void> {
  await renderReady
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (fonts) await fonts.ready
  await Promise.all(Array.from(root.querySelectorAll('img'), waitForImage))
}
