import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop package metadata', () => {
  it('uses stable product identity and platform metadata', async () => {
    const raw = await readFile('electron-builder.json5', 'utf8')
    const config = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//gu, ''))

    expect(config.appId).toBe('com.qingshu.editor')
    expect(config.productName).toBe('Qingshu')
    expect(config.mac.icon).toBe('build/icon.png')
    expect(config.win.icon).toBe('build/icon.ico')
    expect(config.win.target).toContainEqual({
      target: 'nsis',
      arch: ['x64'],
    })
    expect(config.linux).toMatchObject({
      icon: 'build/icon.png',
      category: 'Office',
    })
  })

  it('includes original SVG, PNG, and Windows ICO icon assets', async () => {
    const [svg, png, ico] = await Promise.all([
      readFile('build/icon.svg'),
      readFile('build/icon.png'),
      readFile('build/icon.ico'),
    ])

    expect(svg.toString('utf8')).toContain('<svg')
    expect(svg.toString('utf8')).toContain('Qingshu book and leaf icon')
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
  })
})
