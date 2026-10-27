import { describe, it, expect } from 'vitest'

import { readRepoSource as read } from '@/test-support/repo-source'

// Mapbox's terms require both the wordmark and the attribution to be visible, and every way of
// getting that wrong is silent: a control in the corner the drawer takes renders perfectly, behind
// a panel, and no gate in this repo looks at a corner name.
//
// Two literals pick that corner — `logoPosition` on the map, `position` on the control — and
// mapbox reads each once, at construction. If they drift apart the wordmark and the attribution
// land in different corners, and one of them goes under the drawer.
//
// This reads the file rather than importing `Map.tsx`: importing the map would pull react-map-gl,
// and so the whole of mapbox-gl, into the node lane.
const MAP = 'src/components/organisms/Mapbox/Map.tsx'
// Where the bottom sheet's lowest snap lives, which is what rules out both bottom corners.
const STACK = 'src/views/DrawerStack/DrawerStack.tsx'

const cornerIn = (source: string, prop: string) =>
  source.match(new RegExp(`${prop}="((?:top|bottom)-(?:left|right))"`))?.[1]

describe('the Mapbox wordmark and attribution corner', () => {
  const map = read(MAP)
  const control = map.match(/<AttributionControl\b[^>]*>/)?.[0] ?? ''

  it('renders exactly one attribution, and it is the one this app places', () => {
    // Mapbox adds its own at a position no prop can change, so both halves matter: declining it
    // and rendering the control. Dropping either leaves no attribution or two of them.
    expect(map).toContain('attributionControl={false}')
    expect(map.match(/<AttributionControl\b/g)).toHaveLength(1)
    expect(control).toContain('compact')
  })

  it('puts the wordmark and the attribution in the same corner', () => {
    expect(cornerIn(control, 'position')).toBe(cornerIn(map, 'logoPosition'))
  })

  it('picks a corner no drawer covers', () => {
    // The bottom sheet sits at its peek at every snap, so nothing on the bottom edge is ever
    // uncovered on a narrow embed. The peek is `DrawerStack`'s own literal, not restated here —
    // a dismissible sheet would free a bottom corner and relax this.
    const peek = Number(read(STACK).match(/const PEEK_SNAP = '(\d+)px'/)?.[1])

    expect(peek, "the bottom sheet's peek").toBeGreaterThan(0)
    // The remaining side is the cog's: it takes the inline start in both layouts, so the credits
    // take the other. Physical, and paired with the drawer's deferred RTL flip (`atoms/Drawer`'s
    // `TODO(rtl, #52 WS8)`) — the cog is on the left under RTL today too.
    expect(cornerIn(control, 'position')).toBe('top-right')
  })
})
