import { describe, expect, it } from 'vitest'

import { fitHeight } from './use-fit-snap'

describe('fitHeight', () => {
  const base = { bodyOffset: 68, contentHeight: 285, footerSpace: 69, frameHeight: 844 }

  it('adds the header, the content and the footer it clears', () => {
    expect(fitHeight(base)).toBe(422)
  })

  it('rounds up, so the last row is never cut by a fraction of a pixel', () => {
    expect(fitHeight({ ...base, contentHeight: 285.2 })).toBe(423)
  })

  it('gives way to the near-full snap when the content is that tall', () => {
    expect(fitHeight({ ...base, contentHeight: 900 })).toBeNull()
  })

  it('ignores a sheet that has not laid out yet', () => {
    expect(fitHeight({ ...base, bodyOffset: 0, contentHeight: 0, footerSpace: 0 })).toBeNull()
    expect(fitHeight({ ...base, frameHeight: 0 })).toBeNull()
  })
})
