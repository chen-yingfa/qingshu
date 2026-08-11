import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop package metadata', () => {
  it('uses stable product identity and platform metadata', async () => {
    const raw = await readFile('electron-builder.json5', 'utf8')
    const config = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//gu, ''))

    expect(config.appId).toBe('com.qingshu.editor')
    expect(config.productName).toBe('Qingshu')
    expect(config.files).toContain('!node_modules/**')
    expect(config.mac.icon).toBe('build/icon.icns')
    expect(config.win.icon).toBe('build/icon.ico')
    expect(config.win.target).toContainEqual({
      target: 'nsis',
      arch: ['x64'],
    })
    expect(config.linux).toMatchObject({
      icon: 'build/icon-source.png',
      category: 'Office',
      syncDesktopName: true,
    })
    const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'))
    expect(packageMetadata.desktopName).toBe('Qingshu')
    expect(packageMetadata.dependencies).toBeUndefined()
    expect(packageMetadata.scripts.prebuild).toBe('npm run icons')
    expect(packageMetadata.scripts.clean).toBe('node build/clean.mjs')
    expect(await readFile('index.html', 'utf8')).toContain(
      'rel="icon" type="image/png" href="/icon.png"',
    )
  })

  it('includes generated PNG, Windows ICO, and macOS ICNS assets', async () => {
    const generatedPaths = [
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
    const [publicPng, ico, icns] = after

    expect(source.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(source.readUInt32BE(16)).toBe(1024)
    expect(source.readUInt32BE(20)).toBe(1024)
    await expect(access('build/icon.png')).rejects.toThrow()
    expect(publicPng.readUInt32BE(16)).toBe(256)
    expect(publicPng.readUInt32BE(20)).toBe(256)
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const icoCount = ico.readUInt16LE(4)
    const icoRanges: Array<[number, number]> = []
    const icoSizes = Array.from({ length: icoCount }, (_, index) => {
      const entry = 6 + index * 16
      const width = ico[entry] === 0 ? 256 : ico[entry]
      const height = ico[entry + 1] === 0 ? 256 : ico[entry + 1]
      const payloadLength = ico.readUInt32LE(entry + 8)
      const payloadOffset = ico.readUInt32LE(entry + 12)
      expect(height).toBe(width)
      expect(ico.readUInt16LE(entry + 4)).toBe(1)
      expect(ico.readUInt16LE(entry + 6)).toBe(32)
      expect(payloadOffset).toBeGreaterThanOrEqual(6 + icoCount * 16)
      expect(payloadOffset + payloadLength).toBeLessThanOrEqual(ico.length)
      icoRanges.push([payloadOffset, payloadOffset + payloadLength])
      const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])
      if (
        ico.subarray(payloadOffset, payloadOffset + 8).equals(pngSignature)
      ) {
        expect(ico.readUInt32BE(payloadOffset + 16)).toBe(width)
        expect(ico.readUInt32BE(payloadOffset + 20)).toBe(height)
        expect(
          ico
            .subarray(
              payloadOffset + payloadLength - 8,
              payloadOffset + payloadLength - 4,
            )
            .toString('ascii'),
        ).toBe('IEND')
      } else {
        expect(ico.readUInt32LE(payloadOffset)).toBe(40)
        expect(ico.readInt32LE(payloadOffset + 4)).toBe(width)
        expect(Math.abs(ico.readInt32LE(payloadOffset + 8)) / 2).toBe(height)
        expect(ico.readUInt16LE(payloadOffset + 12)).toBe(1)
        expect(ico.readUInt16LE(payloadOffset + 14)).toBe(32)
        expect(payloadLength).toBeGreaterThanOrEqual(40 + width * height * 4)
      }
      return width
    }).sort((left, right) => left - right)
    expect(icoSizes).toEqual([16, 32, 48, 256])
    icoRanges.sort(([left], [right]) => left - right)
    for (let index = 1; index < icoRanges.length; index += 1) {
      expect(icoRanges[index][0]).toBeGreaterThanOrEqual(
        icoRanges[index - 1][1],
      )
    }

    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    const icnsEntries = new Map<string, number>()
    let icnsOffset = 8
    for (; icnsOffset < icns.length; ) {
      const offset = icnsOffset
      const type = icns.subarray(offset, offset + 4).toString('ascii')
      const length = icns.readUInt32BE(offset + 4)
      expect(length).toBeGreaterThan(20)
      expect(offset + length).toBeLessThanOrEqual(icns.length)
      expect(
        icns.subarray(offset + 8, offset + 16),
        `${type} PNG signature`,
      ).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      const width = icns.readUInt32BE(offset + 24)
      const height = icns.readUInt32BE(offset + 28)
      expect(height).toBe(width)
      expect(
        icns
          .subarray(offset + length - 8, offset + length - 4)
          .toString('ascii'),
      ).toBe('IEND')
      icnsEntries.set(type, width)
      icnsOffset += length
    }
    expect(icnsOffset).toBe(icns.length)
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
