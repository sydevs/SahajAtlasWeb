import { describe, it, expect } from 'vitest'

import { readRepoSource as read } from '@/test-support/repo-source'

// Mapbox's wordmark and its attribution are placed across two files that cannot reference each
// other, and every way of getting it wrong is silent.
//
// `Map.tsx` picks the corner and publishes it as a custom property. `styles/globals.css` is what
// moves mapbox's container to it. A rename on either side leaves a `var()` with no value, so the
// fallback takes over and both controls go back under the drawer — lint, typecheck and the rest
// of this lane stay green, because an unresolved custom property is perfectly valid CSS.
//
// This reads the files rather than importing `Map.tsx`: the inset table is module-private, and
// importing the map would pull react-map-gl, and so the whole of mapbox-gl, into the node lane.
const MAP = 'src/components/organisms/Mapbox/Map.tsx'
const SHEET = 'src/styles/globals.css'
// Where the cog the narrow corner has to clear is placed, and how big it is.
const STACK = 'src/views/DrawerStack/DrawerStack.tsx'
const COG = 'src/components/molecules/SettingsMenu/SettingsMenu.tsx'

const PROPERTY = '--sy-map-attribution'
// Mapbox's own container for both controls, which is also the fallback this asserts.
const CONTAINER = '.mapboxgl-ctrl-bottom-left'

// Deliberately unanchored to indentation: the table is matched by its own name, so reformatting
// or re-nesting it cannot turn this into a silent no-match.
const insets = (source: string) => {
  const table = source.match(/const ATTRIBUTION_INSET = \{[\s\S]*?\n\}/)?.[0] ?? ''

  return Object.fromEntries(
    [...table.matchAll(/\b(panel|sheet): '([^']+)'/g)].map(([, name, inset]) => [name, inset]),
  )
}

describe('the Mapbox wordmark and attribution corner', () => {
  const map = read(MAP)
  const sheet = read(SHEET)

  it('declares a corner per layout, and they are different corners', () => {
    const { panel, sheet: narrow } = insets(map)

    // Each is a four-edge `inset` shorthand, in px — a `rem` here would be rescaled by the
    // host document's root font size (#238).
    const EDGES = /^(auto|0|\d+px)( (auto|0|\d+px)){3}$/

    expect(panel).toMatch(EDGES)
    expect(narrow).toMatch(EDGES)
    // The panel and the sheet cover different edges, so one corner cannot serve both.
    expect(panel).not.toBe(narrow)
  })

  it('publishes the corner under the name the stylesheet reads', () => {
    expect(map).toContain(`'${PROPERTY}': ATTRIBUTION_INSET[`)
    expect(sheet).toMatch(
      new RegExp(`\\${CONTAINER}\\s*\\{\\s*inset: var\\(${PROPERTY}, auto auto 0 0\\);`),
    )
  })

  it('renders exactly one attribution, and it is the one this app places', () => {
    // Mapbox adds its own at a position no prop can change, so both halves matter: declining
    // it and rendering the control. Dropping either leaves no attribution or two of them.
    expect(map).toContain('attributionControl={false}')
    expect(map.match(/<AttributionControl\b/g)).toHaveLength(1)
    expect(map).toMatch(/<AttributionControl compact position="bottom-left" \/>/)
  })

  it('clears the settings cog in the narrow layout', () => {
    // The cog is the one thing map mode fixes in that corner. Both halves of its box are
    // Tailwind literals a constant cannot read, so this derives the sum instead of restating
    // it: the scale's own step, the cog's offset, and its square trigger.
    const step = Number(sheet.match(/--spacing:\s*(\d+)px/)?.[1])
    const offset = Number(read(STACK).match(/'fixed top-(\d+) z-\d+'/)?.[1])
    const size = Number(read(COG).match(/\bh-(\d+) w-\1\b/)?.[1])

    // A renamed class gives `NaN`, which fails the comparison below anyway. These name which of
    // the three reads broke, instead of leaving one opaque failure to be worked out.
    expect(step, 'the spacing step').toBeGreaterThan(0)
    expect(offset, "the cog's top offset").toBeGreaterThan(0)
    expect(size, "the cog trigger's size").toBeGreaterThan(0)

    const top = Number(insets(map).sheet.match(/^(\d+)px/)?.[1])

    expect(top).toBeGreaterThanOrEqual(step * (offset + size))
  })
})
