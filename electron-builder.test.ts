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
  })

  it('includes generated PNG, Windows ICO, and macOS ICNS assets', async () => {
    const [source, png, publicPng, ico, icns, generator] = await Promise.all([
      readFile('build/icon-source.png'),
      readFile('build/icon.png'),
      readFile('public/icon.png'),
      readFile('build/icon.ico'),
      readFile('build/icon.icns'),
      readFile('build/generate-icons.mjs', 'utf8'),
    ])

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    expect(png).toEqual(source)
    expect(publicPng.readUInt32BE(16)).toBe(256)
    expect(publicPng.readUInt32BE(20)).toBe(256)
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    for (const type of [
      'icp4',
      'icp5',
      'icp6',
      'ic07',
      'ic08',
      'ic09',
      'ic10',
      'ic11',
      'ic12',
      'ic13',
      'ic14',
    ]) {
      expect(icns.includes(Buffer.from(type))).toBe(true)
    }
    expect(generator).toContain("['ic10', 1024]")
  })
})
