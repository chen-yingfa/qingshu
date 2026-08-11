import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop package metadata', () => {
  it('uses stable product identity and platform metadata', async () => {
    const raw = await readFile('electron-builder.json5', 'utf8')
    const config = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//gu, ''))

    expect(config.appId).toBe('com.qingshu.editor')
    expect(config.productName).toBe('Qingshu')
    expect(config.mac.icon).toBe('build/icon.icns')
    expect(config.win.icon).toBe('build/icon.ico')
    expect(config.win.target).toContainEqual({
      target: 'nsis',
      arch: ['x64'],
    })
    expect(config.linux).toMatchObject({
      icon: 'build/icon.png',
      category: 'Office',
      syncDesktopName: true,
    })
    const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'))
    expect(packageMetadata.desktopName).toBe('Qingshu')
    expect(packageMetadata.scripts.prebuild).toBe('npm run icons')
    expect(await readFile('index.html', 'utf8')).toContain(
      'rel="icon" type="image/png" href="/icon.png"',
    )
  })

  it('includes generated PNG, Windows ICO, and macOS ICNS assets', async () => {
    const generatedPaths = [
      'build/icon.png',
      'public/icon.png',
      'build/icon.ico',
      'build/icon.icns',
    ]
    const before = await Promise.all(generatedPaths.map((path) => readFile(path)))
    execFileSync(process.execPath, ['build/generate-icons.mjs'])
    const after = await Promise.all(generatedPaths.map((path) => readFile(path)))
    expect(after).toEqual(before)

    const [source, generator] = await Promise.all([
      readFile('build/icon-source.png'),
      readFile('build/generate-icons.mjs', 'utf8'),
    ])
    const [png, publicPng, ico, icns] = after

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    expect(png).toEqual(source)
    expect(publicPng.readUInt32BE(16)).toBe(256)
    expect(publicPng.readUInt32BE(20)).toBe(256)
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    const icoCount = ico.readUInt16LE(4)
    const icoSizes = Array.from({ length: icoCount }, (_, index) => {
      const width = ico[6 + index * 16]
      return width === 0 ? 256 : width
    }).sort((left, right) => left - right)
    expect(icoSizes).toEqual([16, 32, 48, 256])

    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    const icnsEntries = new Map<string, number>()
    for (let offset = 8; offset < icns.length; ) {
      const type = icns.subarray(offset, offset + 4).toString('ascii')
      const length = icns.readUInt32BE(offset + 4)
      expect(
        icns.subarray(offset + 8, offset + 16),
        `${type} PNG signature`,
      ).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      icnsEntries.set(type, icns.readUInt32BE(offset + 24))
      offset += length
    }
    expect(Object.fromEntries(icnsEntries)).toEqual({
      icp4: 16,
      icp5: 32,
      icp6: 64,
      ic07: 128,
      ic08: 256,
      ic09: 512,
      ic10: 1024,
      ic11: 32,
      ic12: 64,
      ic13: 256,
      ic14: 512,
    })
    expect(generator).toContain("['ic10', 1024]")
  }, 15_000)
})
