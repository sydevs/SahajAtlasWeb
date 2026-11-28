import { describe, expect, it } from 'vitest'

import { MIN_INLINE_HEIGHT_PX, MIN_INLINE_WIDTH_PX, tooSmall } from './fit'

describe('tooSmall', () => {
  it('fits a 320px phone with page margins', () => {
    expect(tooSmall({ width: 288, height: 600 }, true)).toBeNull()
  })

  it('is too small under the width floor, whether or not the box can grow', () => {
    expect(tooSmall({ width: MIN_INLINE_WIDTH_PX - 1, height: 900 }, true)).toEqual({
      width: MIN_INLINE_WIDTH_PX - 1,
      height: 900,
    })
    expect(tooSmall({ width: MIN_INLINE_WIDTH_PX - 1, height: 900 }, false)).not.toBeNull()
  })

  it('reads the height only where the box cannot grow', () => {
    const short = { width: 600, height: MIN_INLINE_HEIGHT_PX - 1 }

    expect(tooSmall(short, true)).toBeNull()
    expect(tooSmall(short, false)).toEqual(short)
  })

  it('fits at exactly the floor', () => {
    expect(tooSmall({ width: MIN_INLINE_WIDTH_PX, height: MIN_INLINE_HEIGHT_PX }, false)).toBeNull()
  })

  it('waits for a box that is not laid out yet', () => {
    expect(tooSmall({ width: 0, height: 0 }, false)).toBeNull()
    expect(tooSmall({ width: 120, height: 0 }, false)).toBeNull()
  })

  it('reports whole pixels', () => {
    expect(tooSmall({ width: 200.6, height: 300.2 }, false)).toEqual({ width: 201, height: 300 })
  })
})
