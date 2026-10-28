import { describe, it, expect } from 'vitest'

import { readRepoSource as read } from '@/test-support/repo-source'

// Every way of getting this wrong is silent. Mapbox's locate control emits `error` whether or not
// anything listens, so a dropped `onError` leaves the control doing exactly what #321 reported —
// nothing visible — with lint, typecheck and the rest of the lane green.
//
// Nor can the node lane watch the dialog open: `ModalContent` is a portal, so SSR throws on an
// open one and renders nothing at all for a closed one, which makes an absence assertion vacuous
// (`docs/testing.md`). So this pins the wiring, and the attended browser pass #321 asks for is
// what observes the dialog itself.
//
// This reads the file rather than importing `Map.tsx`: importing the map would pull react-map-gl,
// and so the whole of mapbox-gl, into the node lane.
const MAP = 'src/components/organisms/Mapbox/Map.tsx'
const MODAL = 'src/components/atoms/Modal/Modal.tsx'

describe('a refused location request', () => {
  const map = read(MAP)
  // Not `[^>]*`: an arrow function in a handler carries a `>` of its own.
  const control = map.match(/<GeolocateControl\b[\s\S]*?\/>/)?.[0] ?? ''

  it('is heard by the locate control', () => {
    // A `useState` setter needs none of `use-geolocate.ts`'s live-ref machinery, since its
    // identity is already stable — but it does have to be handed over.
    expect(control, 'the GeolocateControl element').toContain('onError')
    expect(control).toMatch(/onError=\{\(\) => setLocationFailed\(true\)\}/)
  })

  it('opens a dialog that is a sibling of the map, not part of its subtree', () => {
    // react-map-gl reconciles its children as map controls and sources. The dialog is neither,
    // and inside `<ReactMapGL>` it would be reparented into mapbox's own container.
    const [beforeMap, afterMap] = map.split('</ReactMapGL>')

    expect(afterMap, 'markup after the map element').toContain('<Modal')
    expect(beforeMap).not.toContain('<Modal')
  })

  it('offers a close control big enough for touch, below the header ×', () => {
    expect(map.split('</ReactMapGL>')[1]).toContain('<ModalFooter>')
  })

  it('renders inside the widget theme root, not on the host page body', () => {
    // The dialog inherits this from the atom, which is the reason to reach for the atom rather
    // than Radix directly: `overlayContainer()` targets the theme root, so the brand variables
    // and the light/dark class reach the portal. `document.body` is the host's.
    expect(read(MODAL)).toContain('container={overlayContainer()}')
  })
})
