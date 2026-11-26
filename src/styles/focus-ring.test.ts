import { describe, expect, it } from 'vitest'

import { readSourceWithoutComments, sourceFiles } from '@/test-support/source-tree'
import { TOUCH_ONLY_QUERY } from '@/config/responsive'

/**
 * Both utilities are CSS, so nothing else in the unit lane notices one drifting: a control
 * drawing its own ring brings back a second focus style, and a tap area under a looser query
 * hands a touchscreen laptop's mouse an area it cannot see.
 */

const globals = readSourceWithoutComments('styles/globals.css')

const utility = (name: string) =>
  globals.match(new RegExp(`@utility ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ''

describe('touch-target', () => {
  it('applies on the touch-only screens useCoarsePointer answers for', () => {
    expect(utility('touch-target')).toContain(`@media ${TOUCH_ONLY_QUERY}`)
  })
})

describe('focus-ring', () => {
  it('draws inside the control, with a band of the panel colour', () => {
    expect(utility('focus-outline')).toContain(
      '@apply outline-2 -outline-offset-2 outline-focus inset-ring-4 inset-ring-background',
    )
  })

  it('is the drawing the geocoder field restates in its own sheet, which no utility reaches', () => {
    const geocoder = readSourceWithoutComments('components/organisms/Mapbox/themes.ts').match(
      /\.Geocoder:has\(\.Input:focus-visible\) \{[^}]*\}/,
    )?.[0]

    expect(geocoder).toContain('outline: 2px solid var(--color-focus)')
    expect(geocoder).toContain('outline-offset: -2px')
    expect(geocoder).toContain('inset 0 0 0 4px hsl(var(--background))')
  })

  it('draws on keyboard focus alone', () => {
    expect(utility('focus-ring')).toMatch(/&:focus-visible\s*{\s*@apply focus-outline;/)
  })

  it('is the only focus indicator a component draws', () => {
    // A ring in the focus colour, behind any state: `focus-visible:`, `has-[:focus-visible]:`…
    const OWN_RING = /\bring-focus\b|focus(?:-visible|-within)?\]?:(?:ring|outline)-\d/
    const drifted = sourceFiles({ extensions: ['.ts', '.tsx'] }).filter((path) =>
      OWN_RING.test(readSourceWithoutComments(path)),
    )

    expect(drifted).toEqual([])
  })
})
