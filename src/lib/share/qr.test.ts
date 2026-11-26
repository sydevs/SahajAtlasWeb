import { describe, expect, it } from 'vitest'

import { encodeQr, qrFileName, qrPngScale, qrSvgPath } from './qr'

const URL = 'https://wemeditate.com/map/gb/south-east/london/balham-library/1392'

describe('encodeQr', () => {
  it('returns a square matrix with a clear four-module quiet zone', async () => {
    const matrix = await encodeQr(URL)
    const size = matrix.length
    const border = [
      ...matrix.slice(0, 4).flat(),
      ...matrix.slice(-4).flat(),
      ...matrix.flatMap((row) => [...row.slice(0, 4), ...row.slice(-4)]),
    ]

    expect(matrix.every((row) => row.length === size)).toBe(true)
    expect(border.some(Boolean)).toBe(false)
    // The top-left finder pattern starts right inside the quiet zone.
    expect(matrix[4]?.slice(4, 11)).toEqual(Array(7).fill(true))
  })

  it('encodes at error correction M, which sizes this 67-byte link to version 5', async () => {
    // Version 5 is 37 modules, plus 8 of quiet zone. At L it fits version 4 (41); at Q, 6 (49).
    expect((await encodeQr(URL)).length).toBe(45)
  })
})

describe('qrSvgPath', () => {
  it('draws one unit square per dark module', () => {
    expect(
      qrSvgPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })
})

describe('qrPngScale', () => {
  it('prints a class link at least 1000 px wide, at whole pixels per module', async () => {
    const matrix = await encodeQr(URL)
    const scale = qrPngScale(matrix)

    expect(Number.isInteger(scale)).toBe(true)
    expect(matrix.length * scale).toBeGreaterThanOrEqual(1000)
    expect(matrix.length * scale).toBeLessThanOrEqual(1200)
  })
})

describe('qrFileName', () => {
  it('names the image after the class', () => {
    expect(qrFileName('Evening Meditation at The Hut')).toBe('evening-meditation-at-the-hut-qr.png')
  })

  it('falls back to a generic name for a title with no Latin letters', () => {
    expect(qrFileName('瞑想')).toBe('class-qr.png')
  })
})
