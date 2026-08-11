import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { Icns, IcnsImage } from '@fiahfy/icns'
import pngToIco from 'png-to-ico'

const directory = fileURLToPath(new URL('.', import.meta.url))
const pngPath = `${directory}icon.png`
const png = await readFile(pngPath)

await writeFile(`${directory}icon.ico`, await pngToIco(pngPath))

const icns = new Icns()
icns.append(IcnsImage.fromPNG(png, 'ic10'))
await writeFile(`${directory}icon.icns`, icns.data)
