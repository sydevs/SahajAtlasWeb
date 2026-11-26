import { describe, expect, it } from 'vitest'

import { fitHeight, foldHeight } from './use-fit-snap'

import { SHEET_OPEN_PX } from '@/config/responsive'

describe('fitHeight', () => {
  const base = { bodyOffset: 68, contentHeight: 285, footerSpace: 69, frameHeight: 844 }

  it('adds the header, the content and the footer it clears', () => {
    expect(fitHeight(base)).toBe(422)
  })

  it('rounds up, so the last row is never cut by a fraction of a pixel', () => {
    expect(fitHeight({ ...base, contentHeight: 285.2 })).toBe(423)
  })

  it('gives way to the near-full snap when the content is that tall', () => {
    expect(fitHeight({ ...base, contentHeight: 900 })).toBe('full')
  })

  it('ignores a sheet that has not laid out yet', () => {
    expect(fitHeight({ ...base, bodyOffset: 0, contentHeight: 0, footerSpace: 0 })).toBeNull()
    expect(fitHeight({ ...base, frameHeight: 0 })).toBeNull()
  })
})

describe('foldHeight', () => {
  // 375×667: the address ends 300px down the sheet, and the footer takes 150px.
  const base = { foldBottom: 300, footerSpace: 150, frameHeight: 667 }

  it('stops at two thirds of the frame, so the map keeps a third', () => {
    expect(foldHeight({ ...base, frameHeight: 667 })).toBe(440)
  })

  it('fits the key facts exactly on a taller phone', () => {
    expect(foldHeight({ ...base, frameHeight: 844 })).toBe(462)
  })

  it('never sits below the shared open stop', () => {
    expect(foldHeight({ ...base, foldBottom: 120, frameHeight: 844 })).toBe(SHEET_OPEN_PX)
  })

  it('ignores rows that have not laid out yet', () => {
    expect(foldHeight({ ...base, foldBottom: 0 })).toBeNull()
    expect(foldHeight({ ...base, frameHeight: 0 })).toBeNull()
  })
})
