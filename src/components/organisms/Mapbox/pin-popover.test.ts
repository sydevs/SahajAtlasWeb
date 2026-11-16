import { describe, expect, it } from 'vitest'

import { pinPopoverPlacement } from './pin-popover'

import { REAL_POINTER_QUERY } from '@/config/responsive'

const MAP = { width: 1280, height: 800 }
const NONE = { top: 0, right: 0, bottom: 0, left: 0 }

describe('pinPopoverPlacement', () => {
  it('sits above the pin when there is room', () => {
    expect(pinPopoverPlacement({ x: 640, y: 400 }, MAP, NONE)).toEqual({
      anchor: 'bottom',
      offset: [0, -38],
    })
  })

  it('drops below the pin near the top edge, where it used to clip', () => {
    expect(pinPopoverPlacement({ x: 640, y: 60 }, MAP, NONE).anchor).toBe('top')
  })

  it('stays clear of the side panel, not just the canvas edge', () => {
    const padding = { ...NONE, left: 384 }

    expect(pinPopoverPlacement({ x: 420, y: 400 }, MAP, padding).anchor).toBe('bottom-left')
    expect(pinPopoverPlacement({ x: 420, y: 400 }, MAP, NONE).anchor).toBe('bottom')
  })

  it('pushes left near the right edge', () => {
    expect(pinPopoverPlacement({ x: 1240, y: 60 }, MAP, NONE).anchor).toBe('top-right')
  })
})

describe('the pin hover gate', () => {
  it('asks for a real pointer', () => {
    expect(REAL_POINTER_QUERY).toBe('(hover: hover) and (pointer: fine)')
  })
})
