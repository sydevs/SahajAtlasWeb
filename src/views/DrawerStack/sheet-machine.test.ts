import type { SheetEvent } from './sheet-machine'

import { describe, expect, it, vi } from 'vitest'

import { createSheetStore, escapeGoesOutward, isCollapsed, onVaulSnap } from './sheet-machine'
import { FIT_SNAP, HOME_SNAP, OPEN_SNAP, PEEK_SNAP, sheetLadder } from './sheet-ladder'

import { WIDE_SNAP } from '@/config/responsive'

const sheet = (...events: SheetEvent[]) => {
  const rewrite = vi.fn()
  const store = createSheetStore(rewrite)

  events.forEach((event) => store.send(event))

  return { store, rewrite, snap: () => store.getSnapshot().context.snap }
}

const view = (opening: 'tall' | 'fit' | 'open' | 'home', openSnap = OPEN_SNAP): SheetEvent => ({
  type: 'VIEW_CHANGED',
  opening,
  openSnap,
})

describe('the opening on a view change', () => {
  it.each([
    ['tall', OPEN_SNAP, WIDE_SNAP],
    ['fit', FIT_SNAP, FIT_SNAP],
    ['open', OPEN_SNAP, OPEN_SNAP],
    ['home', HOME_SNAP, HOME_SNAP],
  ] as const)('opens a %s view at its own stop', (opening, openSnap, expected) => {
    expect(sheet({ type: 'COLLAPSE' }, view(opening, openSnap)).snap()).toBe(expected)
  })

  it('starts at the shared open stop', () => {
    expect(sheet().snap()).toBe(OPEN_SNAP)
  })
})

describe('a new searched place', () => {
  it('lifts the sheet out of its peek', () => {
    expect(sheet({ type: 'COLLAPSE' }, { type: 'SEARCH_MOVED' }).snap()).toBe(OPEN_SNAP)
  })

  it.each([WIDE_SNAP, '440px', FIT_SNAP])('leaves a sheet at %s where the visitor put it', (at) => {
    const { store, snap } = sheet(view('fit', FIT_SNAP))
    const ladder = sheetLadder({ classView: true, fit: 600, fold: 440 })

    store.send({ type: 'VAUL_SNAP', next: at, ladder, cap: null, openSnap: FIT_SNAP })
    const before = snap()

    store.send({ type: 'SEARCH_MOVED' })
    expect(snap()).toBe(before)
  })
})

describe('the header toggle', () => {
  it('opens a collapsed sheet at the view’s open stop, and collapses any other', () => {
    const { store, snap } = sheet(view('fit', FIT_SNAP))

    store.send({ type: 'TOGGLE', openSnap: FIT_SNAP })
    expect(snap()).toBe(PEEK_SNAP)
    store.send({ type: 'TOGGLE', openSnap: FIT_SNAP })
    expect(snap()).toBe(FIT_SNAP)
  })
})

describe('onVaulSnap', () => {
  const filters = sheetLadder({ classView: false, fit: 600, fold: null })
  const echo = { ladder: filters, cap: null, openSnap: FIT_SNAP }

  it('keeps the fit token through an echo of the stop it resolved to', () => {
    expect(onVaulSnap(FIT_SNAP, { ...echo, next: '600px' })).toBe(FIT_SNAP)
  })

  it('keeps the fit token through an echo of a fit that is no px stop of its own', () => {
    const full = sheetLadder({ classView: false, fit: 'full', fold: null })

    expect(
      onVaulSnap(FIT_SNAP, { ladder: full, cap: null, openSnap: FIT_SNAP, next: WIDE_SNAP }),
    ).toBe(FIT_SNAP)
  })

  it('maps the fit’s px back to the token from any other stop', () => {
    expect(onVaulSnap(PEEK_SNAP, { ...echo, next: '600px' })).toBe(FIT_SNAP)
  })

  it('takes any other stop literally, so a dragged key-facts stop is held', () => {
    expect(onVaulSnap(FIT_SNAP, { ...echo, next: OPEN_SNAP })).toBe(OPEN_SNAP)
    expect(
      onVaulSnap(FIT_SNAP, {
        ladder: sheetLadder({ classView: true, fit: 600, fold: 440 }),
        cap: null,
        openSnap: FIT_SNAP,
        next: '440px',
      }),
    ).toBe('440px')
  })

  describe('under a short window’s cap', () => {
    const capped = { ladder: filters, cap: 500, openSnap: FIT_SNAP, next: '500px' }

    it('stays put when the stop it sits at already caps to the cap', () => {
      expect(onVaulSnap(FIT_SNAP, capped)).toBe(FIT_SNAP)
    })

    it('opens at the usual open stop from a stop the cap does not reach', () => {
      expect(onVaulSnap(PEEK_SNAP, capped)).toBe(FIT_SNAP)
      // The near-full stop is a fraction, so it is never capped: reaching the cap is a drag down.
      expect(onVaulSnap(WIDE_SNAP, { ...capped, openSnap: OPEN_SNAP })).toBe(OPEN_SNAP)
    })

    it('takes the cap literally when it is a real rung', () => {
      const ladder = sheetLadder({ classView: false, fit: 500, fold: null })

      expect(onVaulSnap(PEEK_SNAP, { ...capped, ladder })).toBe(FIT_SNAP)
    })
  })
})

describe('"Show N classes"', () => {
  it('opens the results it closes onto tall, once', () => {
    const { store, snap } = sheet({ type: 'SHOW_RESULTS', tall: true }, view('open'))

    expect(snap()).toBe(WIDE_SNAP)
    store.send(view('open'))
    expect(snap()).toBe(OPEN_SNAP)
  })

  it('opens nothing tall when the sheet cannot collapse', () => {
    expect(sheet({ type: 'SHOW_RESULTS', tall: false }, view('open')).snap()).toBe(OPEN_SNAP)
    expect(
      sheet(
        { type: 'SHOW_RESULTS', tall: true },
        { type: 'SHOW_RESULTS', tall: false },
        view('open'),
      ).snap(),
    ).toBe(OPEN_SNAP)
  })

  it('is spent by a collapse with no step back, so a later view does not open tall', () => {
    const { store, snap } = sheet({ type: 'SHOW_RESULTS', tall: true }, { type: 'COLLAPSE' })

    expect(snap()).toBe(PEEK_SNAP)
    store.send(view('open'))
    expect(snap()).toBe(OPEN_SNAP)
  })

  it('is spent by a move that changed no view', () => {
    const { store, snap } = sheet(
      { type: 'SHOW_RESULTS', tall: true },
      { type: 'LOCATION_SETTLED' },
    )

    store.send(view('open'))
    expect(snap()).toBe(OPEN_SNAP)
  })

  it('survives the settle of the move that changed the view, which already spent it', () => {
    const { store } = sheet({ type: 'SHOW_RESULTS', tall: true }, view('open'))

    store.send({ type: 'LOCATION_SETTLED' })
    expect(store.getSnapshot().value).toEqual({ results: 'idle', landing: 'idle' })
  })
})

describe('a step back’s landing', () => {
  const location = (key: string, pathname: string, search = ''): SheetEvent => ({
    type: 'LOCATION',
    key,
    pathname,
    search,
    state: { depth: 1 },
  })
  const stepBack: SheetEvent = { type: 'STEP_BACK', key: 'filters', to: '/search?format=online' }

  it('waits out the location it left', () => {
    const { rewrite, store } = sheet(stepBack, location('filters', '/filters'))

    expect(rewrite).not.toHaveBeenCalled()
    expect(store.getSnapshot().value).toMatchObject({ landing: 'pending' })
  })

  it('rewrites the landed entry to the answers tapped since', () => {
    const { rewrite, store } = sheet(stepBack, location('search', '/search', '?format=any'))

    expect(rewrite).toHaveBeenCalledExactlyOnceWith('/search?format=online', { depth: 1 })
    expect(store.getSnapshot().context.landing).toBeNull()
  })

  it.each([
    ['already carries them', location('search', '/search', '?format=online')],
    ['landed on another path', location('region', '/gb')],
  ])('leaves an entry that %s, and is spent', (_, landed) => {
    const { rewrite, store } = sheet(stepBack, landed)

    expect(rewrite).not.toHaveBeenCalled()
    expect(store.getSnapshot().value).toMatchObject({ landing: 'idle' })
    store.send(location('next', '/search', '?format=any'))
    expect(rewrite).not.toHaveBeenCalled()
  })

  it('aims at the latest step back', () => {
    const { rewrite } = sheet(
      stepBack,
      { type: 'STEP_BACK', key: 'filters', to: '/search?format=in-person' },
      location('search', '/search'),
    )

    expect(rewrite).toHaveBeenCalledExactlyOnceWith('/search?format=in-person', { depth: 1 })
  })
})

describe('the header and the Escape ladder', () => {
  const cases = [true, false].flatMap((canCollapse) =>
    [true, false].flatMap((atPeek) =>
      [true, false].map((hasStep) => ({ canCollapse, atPeek, hasStep })),
    ),
  )

  it.each(cases)('agree on a collapsed sheet: %o', ({ canCollapse, atPeek, hasStep }) => {
    const collapsed = isCollapsed({ canCollapse, atPeek })
    const outward = escapeGoesOutward({ hasStep, canCollapse, collapsed })

    // A sheet the header shows open takes Escape itself; one it shows collapsed, with no step
    // back, hands the key outward.
    if (canCollapse && !collapsed) expect(outward).toBe(false)
    if (collapsed && !hasStep) expect(outward).toBe(true)
    if (hasStep) expect(outward).toBe(false)
  })

  it('never reads a sheet that cannot collapse as collapsed', () => {
    expect(isCollapsed({ canCollapse: false, atPeek: true })).toBe(false)
    expect(escapeGoesOutward({ hasStep: false, canCollapse: false, collapsed: false })).toBe(true)
  })
})
