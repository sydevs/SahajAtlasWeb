import { describe, it, expect } from 'vitest'

import { readRepoSource as read } from '@/test-support/repo-source'

// Mapbox's terms require both the wordmark and the attribution to be visible, and every way of
// getting that wrong is silent: a control in the corner the drawer takes renders perfectly, behind
// a panel, and no gate in this repo looks at a corner name.
//
// Two literals pick the corners — `logoPosition` on the map, `position` on the control column that
// carries the attribution — and mapbox reads each once, at construction. They name different
// corners on purpose, so each is pinned on its own.
//
// This reads the files rather than rendering them: mapbox reads these literals only when it
// constructs a map, which takes a WebGL context the node lane does not have.
const MAP = 'src/components/organisms/Mapbox/Map.tsx'
const CONTROLS = 'src/components/organisms/Mapbox/MapControls.tsx'
const STYLES = 'src/styles/globals.css'
// Where the bottom sheet's lowest snap lives, which is what rules out both bottom corners for the
// attribution.
const STACK = 'src/views/DrawerStack/DrawerStack.tsx'

const cornerIn = (source: string, prop: string) =>
  source.match(new RegExp(`${prop}(?:="|: ')((?:top|bottom)-(?:left|right))['"]`))?.[1]

describe('the Mapbox wordmark and attribution corners', () => {
  const map = read(MAP)
  const controls = read(CONTROLS)
  const column = controls.match(/useControl\(([\s\S]*?)\n {2}\)/)?.[1] ?? ''

  it('renders exactly one attribution, and it is the one this app places', () => {
    // Mapbox adds its own at a position no prop can change, so both halves matter: declining it
    // and rendering the column that carries it. Dropping either leaves no attribution or two.
    expect(map).toContain('attributionControl={false}')
    expect(map).not.toMatch(/<AttributionControl\b/)
    expect(map.match(/<MapControls\b/g)).toHaveLength(1)
    expect(controls.match(/new mapLib\.AttributionControl\(/g)).toHaveLength(1)
    expect(column, "the column's useControl call").toContain('compact: true')
    // Created but never added to the map, so the column is what puts it on screen.
    expect(controls).toMatch(/append\(this\.attribution\.onAdd\(map\)\)/)
  })

  it('puts the attribution in the one corner no drawer covers', () => {
    // The bottom sheet sits at its peek at every snap, so nothing on the bottom edge is ever
    // uncovered on a narrow embed. The peek is `DrawerStack`'s own literal, not restated here —
    // a dismissible sheet would free a bottom corner and relax this.
    const peek = Number(read(STACK).match(/const PEEK_SNAP = '(\d+)px'/)?.[1])

    expect(peek, "the bottom sheet's peek").toBeGreaterThan(0)
    // The side panel takes the left in a wide layout, so this is the right. Physical, and paired
    // with the drawer's deferred RTL flip (`atoms/Drawer`'s `TODO(rtl, #52 WS8)`).
    expect(cornerIn(column, 'position')).toBe('top-right')
  })

  it('keeps the wordmark out of the corner the side panel covers', () => {
    // Bottom right, not mapbox's own bottom left, which the 352px side panel covers on a wide
    // embed — the half of #324 that hid the wordmark there. The narrow sheet covers this corner
    // too, which #330's review accepted rather than buy the measurement back for.
    expect(cornerIn(map, 'logoPosition')).toBe('bottom-right')
  })

  it('restyles the credits button through class names mapbox-gl still renders', () => {
    // A mapbox-gl upgrade that renames these would drop the disc and the dark theme without a
    // sound, leaving Mapbox's white button beside two of ours.
    const selectors = read(STYLES)
      .split('\n')
      .filter((line) => line.startsWith('.sy-map-controls '))

    for (const name of [
      'mapboxgl-ctrl-attrib',
      'mapboxgl-compact',
      'mapboxgl-ctrl-attrib-button',
    ]) {
      expect(
        selectors.some((line) => new RegExp(`\\.${name}(?![\\w-])`).test(line)),
        name,
      ).toBe(true)
    }
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

  it("is asked for by the column's button, with Mapbox's own hidden", () => {
    // Mapbox's button left visible would be a second find-me in the corner.
    expect(control, 'the GeolocateControl element').toContain('showButton={false}')
    expect(map).toMatch(/geolocateRef\.current\?\.trigger\(\)/)
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
      /onCloseAutoFocus=\{[\s\S]*?locateButtonRef\.current\?\.focus\(\)/,
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

// `map-lib.test.ts` covers the loader. What it cannot see is where `Map.tsx` calls it: anywhere but
// the map element — a prefetch at module scope, say — fetches mapbox-gl on every map-less embed,
// which imports the module without rendering a map.
describe('the map library', () => {
  const map = read(MAP)
  const element = map.slice(map.indexOf('<ReactMapGL'), map.indexOf('</ReactMapGL>'))

  it('is handed to react-map-gl, started by the first render', () => {
    expect(element, 'the map element').toMatch(/\bmapLib=\{loadMapLib\(\)\}/)
  })

  it('is loaded nowhere else in the map module', () => {
    expect(map.match(/\bloadMapLib\(\)/g), 'calls of the loader').toHaveLength(1)
    expect(map, 'an import of mapbox-gl').not.toMatch(/(?<!typeof )import\('mapbox-gl'\)/)
  })
})
