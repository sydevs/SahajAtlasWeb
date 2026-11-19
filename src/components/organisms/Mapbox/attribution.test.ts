import { describe, it, expect } from 'vitest'

import { readRepoSource as read } from '@/test-support/repo-source'

// Mapbox's terms require both the wordmark and the attribution to be visible, and every way of
// getting that wrong is silent: a control in the corner the drawer takes renders perfectly, behind
// a panel, and no gate in this repo looks at a corner name.
//
// Two literals pick the corners — `logoPosition` on the map, `position` on the control — and
// mapbox reads each once, at construction. They name different corners on purpose, so each is
// pinned on its own.
//
// This reads the file rather than importing `Map.tsx`: importing the map would pull react-map-gl,
// and so the whole of mapbox-gl, into the node lane.
const MAP = 'src/components/organisms/Mapbox/Map.tsx'
// Where the bottom sheet's lowest snap lives, which is what rules out both bottom corners for the
// attribution.
const STACK = 'src/views/DrawerStack/DrawerStack.tsx'

const cornerIn = (source: string, prop: string) =>
  source.match(new RegExp(`${prop}="((?:top|bottom)-(?:left|right))"`))?.[1]

describe('the Mapbox wordmark and attribution corners', () => {
  const map = read(MAP)
  const control = map.match(/<AttributionControl\b[^>]*>/)?.[0] ?? ''

  it('renders exactly one attribution, and it is the one this app places', () => {
    // Mapbox adds its own at a position no prop can change, so both halves matter: declining it
    // and rendering the control. Dropping either leaves no attribution or two of them.
    expect(map).toContain('attributionControl={false}')
    expect(map.match(/<AttributionControl\b/g)).toHaveLength(1)
    expect(control).toContain('compact')
  })

  it('puts the attribution in the one corner no drawer covers', () => {
    // The bottom sheet sits at its peek at every snap, so nothing on the bottom edge is ever
    // uncovered on a narrow embed. The peek is `DrawerStack`'s own literal, not restated here —
    // a dismissible sheet would free a bottom corner and relax this.
    const peek = Number(read(STACK).match(/const PEEK_SNAP = '(\d+)px'/)?.[1])

    expect(peek, "the bottom sheet's peek").toBeGreaterThan(0)
    // The remaining side is the cog's: it takes the inline start in both layouts, so the
    // attribution takes the other. Physical, and paired with the drawer's deferred RTL flip
    // (`atoms/Drawer`'s `TODO(rtl, #52 WS8)`) — the cog is on the left under RTL today too.
    expect(cornerIn(control, 'position')).toBe('top-right')
  })

  it('keeps the wordmark out of the corner the side panel covers', () => {
    // Bottom right, not mapbox's own bottom left, which the 352px side panel covers on a wide
    // embed — the half of #324 that hid the wordmark there. The narrow sheet covers this corner
    // too, which #330's review accepted rather than buy the measurement back for.
    expect(cornerIn(map, 'logoPosition')).toBe('bottom-right')
  })
})

// The locate control's failure dialog is wired the same silent way: mapbox emits `error` whether
// or not anything listens, and the dialog is a portal the node lane cannot open (`docs/testing.md`),
// so the wiring is what is pinned here and the attended browser pass observes the dialog (#321).
describe('a refused location request', () => {
  const map = read(MAP)
  // Not `[^>]*`: an arrow function in a handler carries a `>` of its own.
  const control = map.match(/<GeolocateControl\b[\s\S]*?\/>/)?.[0] ?? ''

  it('is heard by the locate control', () => {
    expect(control, 'the GeolocateControl element').toMatch(/onError=\{/)
  })

  it('opens a dialog that is a sibling of the map, not part of its subtree', () => {
    // react-map-gl reconciles its children as map controls and sources; inside `<ReactMapGL>` the
    // dialog would be reparented into mapbox's own container.
    const [beforeMap, afterMap] = map.split('</ReactMapGL>')

    expect(afterMap, 'markup after the map element').toContain('<Modal')
    expect(beforeMap).not.toContain('<Modal')
  })

  it('hands focus back to the locate control on close', () => {
    // Radix returns focus to a `Dialog.Trigger`, and this dialog has none.
    expect(map.split('</ReactMapGL>')[1]).toMatch(
      /onCloseAutoFocus=\{[\s\S]*?mapboxgl-ctrl-geolocate/,
    )
  })
})

// react-map-gl reads `language` once, when it constructs the map. Any other string there — the
// region-less `languageCode` the worldview reads, say — type-checks, and every label silently
// starts in the wrong language. The effect beside it is the other half: with `locale` out of its
// deps the map never relabels on a switch, which is the whole reason `syncMapLanguage` exists.
// `map-language.test.ts` covers the helper; nothing but this reaches the two wirings.
describe('the map label language', () => {
  const map = read(MAP)
  const element = map.slice(map.indexOf('<ReactMapGL'), map.indexOf('</ReactMapGL>'))

  it('is the widget locale when the map is constructed', () => {
    expect(element, 'the map element').toMatch(/\blanguage=\{locale\}/)
  })

  it('follows a mid-session switch', () => {
    const effect = /useEffect\(\(\) => \{\s*syncMapLanguage\([^)]*\)\s*\}, \[([^\]]*)\]\)/.exec(map)

    expect(effect?.[0], 'a syncMapLanguage effect').toBeTruthy()
    expect(effect?.[1], "the effect's dependencies").toContain('locale')
  })
})

// iOS sends a fake mouse move before a tap, and treats a tap that reveals content as a hover, so
// the click never fires. Nothing in the node lane can run that, so the wiring is what is pinned.
describe('the pin hover popover', () => {
  it('is wired only on a device with a real pointer', () => {
    expect(read(MAP)).toContain('onMouseMove={hasRealPointer ? hoverOnFeature : undefined}')
  })
})

// react-map-gl imports mapbox-gl from `<Map>`'s mount effect, which waits for the whole interface
// to commit. Handed the import as `mapLib`, started by the map's first render, the library's
// download no longer waits on that. A module-scope import would start it sooner still, and also on
// every map-less embed, which imports this module without rendering a map.
describe('the map library', () => {
  const map = read(MAP)
  const element = map.slice(map.indexOf('<ReactMapGL'), map.indexOf('</ReactMapGL>'))

  it('is handed to react-map-gl, started by the first render', () => {
    expect(element, 'the map element').toMatch(/\bmapLib=\{loadMapLib\(\)\}/)
  })

  it('is imported only inside the loader, never at module scope', () => {
    expect(map.match(/(?<!typeof )import\('mapbox-gl'\)/g), 'imports of mapbox-gl').toHaveLength(1)
    expect(map).toMatch(/const loadMapLib = \(\) => \(mapLib \?\?= import\('mapbox-gl'\)\)/)
  })
})
