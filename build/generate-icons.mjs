import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { Icns, IcnsImage } from '@fiahfy/icns'
import { PNG } from 'pngjs'
import pngToIco from 'png-to-ico'

const directory = fileURLToPath(new URL('.', import.meta.url))
const root = fileURLToPath(new URL('..', import.meta.url))
const sourcePath = `${directory}icon-source.png`
const sourceBuffer = await readFile(sourcePath)
const source = PNG.sync.read(sourceBuffer)

function resizedPng(size) {
  const target = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.max(
      0,
      Math.min(source.height - 1, ((y + 0.5) * source.height) / size - 0.5),
    )
    const y0 = Math.floor(sourceY)
    const y1 = Math.min(source.height - 1, y0 + 1)
    const dy = sourceY - y0
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.max(
        0,
        Math.min(source.width - 1, ((x + 0.5) * source.width) / size - 0.5),
      )
      const x0 = Math.floor(sourceX)
      const x1 = Math.min(source.width - 1, x0 + 1)
      const dx = sourceX - x0
      const destination = (y * size + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = source.data[(y0 * source.width + x0) * 4 + channel]
        const topRight = source.data[(y0 * source.width + x1) * 4 + channel]
        const bottomLeft =
          source.data[(y1 * source.width + x0) * 4 + channel]
        const bottomRight =
          source.data[(y1 * source.width + x1) * 4 + channel]
        target.data[destination + channel] = Math.round(
          (topLeft * (1 - dx) + topRight * dx) * (1 - dy) +
            (bottomLeft * (1 - dx) + bottomRight * dx) * dy,
        )
      }
    }
  }
  return PNG.sync.write(target, { colorType: 6 })
}

await writeFile(`${root}/public/icon.png`, resizedPng(256))
await writeFile(`${directory}icon.ico`, await pngToIco(sourcePath))

const icns = new Icns()
for (const [type, size] of [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]) {
  icns.append(
    IcnsImage.fromPNG(size === 1024 ? sourceBuffer : resizedPng(size), type),
  )
}
await writeFile(`${directory}icon.icns`, icns.data)
