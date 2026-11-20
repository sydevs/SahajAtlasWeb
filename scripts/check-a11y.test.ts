import { describe, expect, it } from 'vitest'

import {
  MIN_TAP_PX,
  PROBE_STEP_PX,
  TAP_EXCEPTIONS,
  formatFailures,
  formatUnmeasured,
  spanFrom,
} from './check-a11y.mjs'

// `spanFrom` is the arithmetic behind every tap-target verdict the gate prints, and it is the
// one part of this gate a browser is not needed to judge. The probe order it reads is
// `[centre, −1, +1, −2, +2, …]`, so these fixtures are written in that order.
describe('spanFrom', () => {
  it('measures the contiguous run outward from the centre, in probe steps', () => {
    // Three hits each side of the centre, at a 1px step: 3 + 3 + the centre pixel.
    expect(spanFrom([true, true, true, true, true, true, true], 1)).toBe(7)
    expect(spanFrom([true, true, true, true, true, true, true], 2)).toBe(13)
  })

  it('stops at the first miss on each side, rather than summing two patches', () => {
    // Crowded on the left at the second probe, clear to the fourth on the right. Counting
    // every hit would read 7; the reachable run is 1 left + 4 right, plus the centre.
    const hits = [true, true, true, false, true, false, true, false, true]

    expect(spanFrom(hits, 1)).toBe(6)
  })

  it('is zero for a control the page does not hand back at its own centre', () => {
    expect(spanFrom([false, true, true], 1)).toBe(0)
  })

  // The gate compares this against 44, so a probe step that did not divide the reach would make
  // a control that exactly meets the floor measure short and fail. At one pixel it cannot.
  it('reports the floor exactly when the area is exactly the floor', () => {
    const reach = Math.ceil(MIN_TAP_PX / 2)
    const hits = [true]

    for (let d = PROBE_STEP_PX; d <= reach; d += PROBE_STEP_PX) {
      hits.push(d <= MIN_TAP_PX / 2, d < MIN_TAP_PX / 2)
    }

    expect(spanFrom(hits, PROBE_STEP_PX)).toBe(MIN_TAP_PX)
  })
})

describe('formatFailures', () => {
  it('groups by story, so one broken component is one section rather than twelve lines', () => {
    const lines = formatFailures([
      { story: 'atoms--button', kind: 'tap-target', detail: 'a' },
      { story: 'views--search', kind: 'color-contrast', detail: 'b' },
      { story: 'atoms--button', kind: 'focus-indicator', detail: 'c' },
    ])

    expect(lines.filter((line) => line.startsWith('###'))).toEqual([
      '### `atoms--button`',
      '### `views--search`',
    ])
    expect(lines).toContain('- **tap-target** — a')
    expect(lines.indexOf('- **focus-indicator** — c')).toBeLessThan(
      lines.indexOf('### `views--search`'),
    )
  })

  it('says nothing at all when nothing failed', () => {
    expect(formatFailures([])).toEqual([])
  })
})

describe('formatUnmeasured', () => {
  // A count cannot be acted on. The control that lands here is the one whose centre sits within
  // half the floor of a viewport edge — a narrow control pinned to a corner, which is the shape
  // the floor exists to catch — so the report has to say which control, in which story.
  it('names each control and the story it sat in', () => {
    const lines = formatUnmeasured([
      { story: 'views--filter', el: 'button "Clear"' },
      { story: 'views--filter', el: 'a "Terms"' },
      { story: 'atoms--chip', el: 'button "Remove"' },
    ])

    expect(lines.filter((line) => line.startsWith('###'))).toEqual([
      '### `views--filter`',
      '### `atoms--chip`',
    ])
    expect(lines).toContain('- **unmeasured** — button "Clear"')
    expect(lines.some((line) => line.includes('3 control(s)'))).toBe(true)
  })

  it('says nothing at all when every control was measured', () => {
    expect(formatUnmeasured([])).toEqual([])
  })
})

describe('TAP_EXCEPTIONS', () => {
  // Every exemption is a hole in the floor, so each one states what it is for. A bare selector
  // list is how the next one gets added without an argument.
  it('gives every exempt selector a reason', () => {
    expect(TAP_EXCEPTIONS.length).toBeGreaterThan(0)
    for (const exception of TAP_EXCEPTIONS) {
      expect(exception.selector).toBeTruthy()
      expect(exception.reason.length).toBeGreaterThan(20)
    }
  })

  // A selector matching a widget control would exempt the thing the gate exists to measure.
  // These three name host-authored prose, a vendor control, and a library's focus sentinels.
  it('exempts nothing of ours', () => {
    expect(TAP_EXCEPTIONS.map((exception) => exception.selector)).toEqual([
      '.colored-links a',
      '.mapboxgl-ctrl-attrib',
      '[data-radix-focus-guard]',
    ])
  })
})
