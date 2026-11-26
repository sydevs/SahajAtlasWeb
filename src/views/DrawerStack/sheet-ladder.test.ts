import { describe, expect, it } from 'vitest'

import {
  FIT_SNAP,
  OPEN_SNAP,
  PEEK_SNAP,
  SNAP_POINTS,
  sheetCoverPx,
  sheetLadder,
} from './sheet-ladder'

import { SHEET_OPEN_PX, SHEET_PEEK_PX, WIDE_SNAP } from '@/config/responsive'

describe('sheetLadder for a class', () => {
  const classView = true

  it('climbs peek, key facts, fit, with nothing above the fit', () => {
    expect(sheetLadder({ classView, fit: 600, fold: 440 })).toEqual({
      points: [PEEK_SNAP, '440px', '600px'],
      fitStop: '600px',
      fitSnap: '600px',
    })
  })

  it('keeps near full only for a class too long to fit', () => {
    expect(sheetLadder({ classView, fit: 'full', fold: 440 })).toEqual({
      points: [PEEK_SNAP, '440px', WIDE_SNAP],
      fitStop: WIDE_SNAP,
      fitSnap: null,
    })
  })

  it('drops the key-facts stop when the whole class fits below it', () => {
    expect(sheetLadder({ classView, fit: 420, fold: 440 }).points).toEqual([PEEK_SNAP, '420px'])
  })

  it('tops out at the open stop for a class shorter than it', () => {
    expect(sheetLadder({ classView, fit: 300, fold: SHEET_OPEN_PX }).points).toEqual([
      PEEK_SNAP,
      OPEN_SNAP,
    ])
  })

  it('stands at the shared open stop while the details load', () => {
    expect(sheetLadder({ classView, fit: null, fold: null })).toEqual({
      points: [PEEK_SNAP, OPEN_SNAP, WIDE_SNAP],
      fitStop: OPEN_SNAP,
      fitSnap: null,
    })
  })
})

describe('sheetLadder for every other view', () => {
  const classView = false

  it('keeps the shared ladder', () => {
    expect(sheetLadder({ classView, fit: null, fold: null }).points).toBe(SNAP_POINTS)
  })

  it('slots a fit (Share) between the open and near-full stops, ignoring any fold', () => {
    expect(sheetLadder({ classView, fit: 600, fold: 440 }).points).toEqual([
      PEEK_SNAP,
      OPEN_SNAP,
      '600px',
      WIDE_SNAP,
    ])
  })
})

describe('sheetCoverPx', () => {
  const at = (snap: number | string, fit: number | 'full' | null, fold: number | null = 440) =>
    sheetCoverPx({ snap, classView: true, fit, fold })

  it('reserves the peek while collapsed', () => {
    expect(at(PEEK_SNAP, 600)).toBe(SHEET_PEEK_PX)
  })

  it('reserves a class open at its fit', () => {
    expect(at(FIT_SNAP, 600)).toBe(600)
  })

  it('reserves the key-facts stop', () => {
    expect(at('440px', 600)).toBe(440)
  })

  it('frames for the key-facts stop where the near-full sheet hides the pin anyway', () => {
    expect(at(FIT_SNAP, 'full')).toBe(440)
    expect(at(WIDE_SNAP, 'full')).toBe(440)
  })

  it('falls back to the open stop before the key facts are measured', () => {
    expect(at(FIT_SNAP, null, null)).toBe(SHEET_OPEN_PX)
  })

  it('leaves other views on the open stop', () => {
    expect(sheetCoverPx({ snap: OPEN_SNAP, classView: false, fit: null, fold: null })).toBe(
      SHEET_OPEN_PX,
    )
  })
})

describe('every ladder', () => {
  // The attribution's corner (`attribution.test.ts`) relies on the peek being the lowest stop.
  it('bottoms out at the peek', () => {
    for (const classView of [true, false]) {
      for (const fit of [null, 'full', 300, 420, 600] as const) {
        expect(sheetLadder({ classView, fit, fold: 440 }).points[0]).toBe(PEEK_SNAP)
      }
    }
  })
})
