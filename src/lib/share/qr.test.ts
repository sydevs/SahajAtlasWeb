import { describe, it, expect } from 'vitest'

import { encodeQr, qrFileName, qrSvgPath } from './qr'

describe('encodeQr', () => {
  it('returns a square code with an empty quiet zone', async () => {
    const matrix = await encodeQr('https://example.org/gb/south-east/london/711')

    expect(matrix.length).toBeGreaterThan(21)
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true)
    expect(matrix[0]?.some(Boolean)).toBe(false)
    expect(matrix.at(-1)?.some(Boolean)).toBe(false)
    expect(matrix.map((row) => row[0]).some(Boolean)).toBe(false)
  })
})

describe('qrSvgPath', () => {
  it('draws one square per dark module', () => {
    expect(
      qrSvgPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })
})

describe('qrFileName', () => {
  it('slugs the title and keeps non-Latin letters', () => {
    expect(qrFileName('Evening Meditation at The Hut')).toBe('evening-meditation-at-the-hut-qr.png')
    expect(qrFileName('Медитация, вечер!')).toBe('медитация-вечер-qr.png')
    expect(qrFileName('???')).toBe('class-qr.png')
  })
})
