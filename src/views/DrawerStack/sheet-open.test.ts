import { describe, expect, it } from 'vitest'

import { type SheetView, openStop, sheetOpens } from './sheet-open'

const phone = { direction: 'bottom', framed: false } as const
const view = (kind: SheetView['kind'], path?: string): SheetView => ({ ...phone, kind, path })
const stop = (over: Partial<Parameters<typeof openStop>[0]>) =>
  openStop({
    asked: false,
    framed: false,
    from: undefined,
    kind: undefined,
    onlineOnly: false,
    searched: false,
    ...over,
  })

/** Walks views through `sheetOpens` as DrawerStack does, and says which ones moved the sheet. */
function walk(steps: [SheetView, boolean?][]) {
  let last: string | null = null

  return steps.map(([v, asked = false]) => {
    const opening = sheetOpens(last, v, asked)

    if (opening !== null) last = opening

    return opening !== null
  })
}

describe('sheetOpens', () => {
  const classA = view('event', '/gb/south-east/london/719')
  const classB = view('event', '/gb/midlands/st-neots/1055')

  it("opens class B at its own height when it is tapped over class A's lowered sheet", () => {
    // A opens, A's content measures again after the visitor lowered it, then B's pin.
    expect(walk([[classA], [classA], [classB, true]])).toEqual([true, false, true])
  })

  it('opens class B anew from a link too, not only from its pin', () => {
    expect(walk([[classA], [classB]])).toEqual([true, true])
  })

  it('opens a class again when its own pin is tapped with it already on screen', () => {
    expect(walk([[classA], [classA, true]])).toEqual([true, true])
  })

  it("opens a place's list anew from a row, a link or Back", () => {
    const czechia = view('region', '/cz')
    const praha = view('region', '/cz/praha')
    const venue = view('region', '/cz/praha/lipanska-8734')

    // Czechia, a row to Praha, a link to the venue, a class, then Back to the venue.
    expect(
      walk([[czechia], [praha], [venue], [view('event', `${venue.path}/1129`)], [venue]]),
    ).toEqual([true, true, true, true, true])
  })

  it('leaves the sheet alone while a list or a class only re-renders in place', () => {
    const praha = view('region', '/cz/praha')

    // A sort or a filter changes the query, not the path.
    expect(walk([[praha], [praha], [praha]])).toEqual([true, false, false])
  })

  it('keeps a re-search and the calendar where the visitor put them', () => {
    expect(walk([[view('search', '/search')], [view('search', '/search')]])).toEqual([true, false])
    expect(walk([[view('calendar', '/calendar')], [view('calendar', '/gb/calendar')]])).toEqual([
      true,
      false,
    ])
  })

  it('opens again when the sheet changes side or moves into a host box', () => {
    const a = view('region', '/cz')

    expect(walk([[a], [{ ...a, direction: 'left' }], [{ ...a, framed: true }]])).toEqual([
      true,
      true,
      true,
    ])
  })
})

describe('openStop', () => {
  it('opens a class, its share panel, a place and the filters at their content height', () => {
    for (const kind of ['event', 'share', 'region', 'filters'] as const) {
      expect(stop({ kind })).toBe('fit')
      expect(stop({ kind, asked: true })).toBe('fit')
    }
  })

  it('opens the calendar, registration, online-only lists and filtered results tall', () => {
    expect(stop({ kind: 'calendar' })).toBe('tall')
    expect(stop({ kind: 'register' })).toBe('tall')
    expect(stop({ kind: 'online', onlineOnly: true })).toBe('tall')
    expect(stop({ kind: 'search', from: 'filters' })).toBe('tall')
  })

  it('opens a searched place at its own stop, and anything else at the usual one', () => {
    expect(stop({ kind: 'search', searched: true })).toBe('search')
    expect(stop({ kind: 'search' })).toBe('open')
    expect(stop({ kind: undefined })).toBe('open')
  })

  it("keeps a host box's own stops, and fills it with a list the map opened", () => {
    expect(stop({ framed: true, kind: 'event' })).toBe('open')
    expect(stop({ framed: true, kind: 'event', asked: true })).toBe('open')
    expect(stop({ framed: true, kind: 'region' })).toBe('open')
    expect(stop({ framed: true, kind: 'region', asked: true })).toBe('full')
  })
})
