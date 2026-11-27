import { describe, expect, it } from 'vitest'

import {
  capPoints,
  FIT_SNAP,
  heldFoldPx,
  OPEN_SNAP,
  PEEK_SNAP,
  resolveStop,
  sheetLadder,
  sheetOpening,
  SNAP_POINTS,
} from './sheet-ladder'

import { SHEET_OPEN_PX, WIDE_SNAP } from '@/config/responsive'

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

  it('keeps the shared ladder, by identity, while the details load', () => {
    const ladder = sheetLadder({ classView, fit: null, fold: null })

    expect(ladder.points).toBe(SNAP_POINTS)
    expect(ladder.fitStop).toBe(OPEN_SNAP)
  })
})

describe('sheetLadder for every other view', () => {
  const classView = false

  it('keeps the shared ladder', () => {
    expect(sheetLadder({ classView, fit: null, fold: null }).points).toBe(SNAP_POINTS)
  })

  it('slots a fit (Share) between the open and near-full stops', () => {
    expect(sheetLadder({ classView, fit: 600, fold: null }).points).toEqual([
      PEEK_SNAP,
      OPEN_SNAP,
      '600px',
      WIDE_SNAP,
    ])
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

describe('heldFoldPx', () => {
  it('holds a px stop the visitor dragged to', () => {
    expect(heldFoldPx('440px')).toBe(440)
  })

  it.each([PEEK_SNAP, OPEN_SNAP, FIT_SNAP, WIDE_SNAP, null])('holds nothing at %s', (snap) => {
    expect(heldFoldPx(snap)).toBeNull()
  })
})

describe('capPoints', () => {
  it('passes every stop through where the window is not short', () => {
    const { points } = sheetLadder({ classView: true, fit: 600, fold: 440 })

    expect(capPoints(points, null)).toBe(points)
  })

  it('leaves a class one stop above the peek where the cap is under its key facts', () => {
    // A 375px-tall frame caps at 300px (`shortSheetCap`), under both the key facts and the fit.
    expect(capPoints(sheetLadder({ classView: true, fit: 600, fold: 440 }).points, 300)).toEqual([
      PEEK_SNAP,
      '300px',
    ])
  })

  it('keeps a class key-facts stop that fits under the cap', () => {
    // The same frame measures its key facts at 247px (`foldHeight`), below the cap.
    expect(capPoints(sheetLadder({ classView: true, fit: 360, fold: 247 }).points, 300)).toEqual([
      PEEK_SNAP,
      '247px',
      '300px',
    ])
  })

  it('leaves the near-full stop alone, a fraction of the frame rather than a height', () => {
    expect(capPoints(sheetLadder({ classView: false, fit: 600, fold: null }).points, 300)).toEqual([
      PEEK_SNAP,
      '300px',
      WIDE_SNAP,
    ])
  })
})

describe('resolveStop', () => {
  const full = sheetLadder({ classView: true, fit: 600, fold: 440 })

  it('shows the fit for the fit token', () => {
    expect(resolveStop(full, FIT_SNAP)).toBe('600px')
  })

  it('shows a stop that is on the ladder as it is', () => {
    expect(resolveStop(full, '440px')).toBe('440px')
    expect(resolveStop(full, PEEK_SNAP)).toBe(PEEK_SNAP)
  })

  it('shows the key facts for a class dragged to the open stop before they were measured', () => {
    expect(resolveStop(full, OPEN_SNAP)).toBe('440px')
  })

  it('shows the top for a near-full stop the ladder dropped', () => {
    // Dragged near full while the details loaded, then the class fitted.
    expect(resolveStop(full, WIDE_SNAP)).toBe('600px')
  })

  it('shows the rung above the peek for a held stop the ladder dropped', () => {
    // Held at its key facts, then the class shrank below them.
    expect(resolveStop(sheetLadder({ classView: true, fit: 420, fold: 440 }), '440px')).toBe(
      '420px',
    )
    // Held at a class's key facts on the render that leaves it for a list, before the reset.
    expect(resolveStop(sheetLadder({ classView: false, fit: null, fold: null }), '440px')).toBe(
      OPEN_SNAP,
    )
  })
})

describe('sheetOpening', () => {
  it('opens the calendar and the sign-up form near full', () => {
    expect(sheetOpening('calendar')).toBe('tall')
    expect(sheetOpening('register')).toBe('tall')
  })

  it('fits a class, its share panel and the filters to their content', () => {
    expect(['event', 'share', 'filters'].map((kind) => sheetOpening(kind as never))).toEqual([
      'fit',
      'fit',
      'fit',
    ])
  })

  it('keeps the open stop for the lists and the root', () => {
    expect(['search', 'region', 'online'].map((kind) => sheetOpening(kind as never))).toEqual([
      'open',
      'open',
      'open',
    ])
    expect(sheetOpening(undefined)).toBe('open')
  })
})
