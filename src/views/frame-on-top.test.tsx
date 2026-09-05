// @vitest-environment jsdom
//
// This opts into a DOM per file (see `docs/testing.md`), because the property under test is a
// RE-RENDER under a changed router context, which SSR markup cannot express: `useFrameOnTop`'s
// effect firing for a view that is no longer the one on top.
//
// That situation is not hypothetical, and it is why this spec exists. `DrawerStack` renders the
// active view inside `<AnimatePresence mode="popLayout">`, which keeps the OUTGOING view mounted
// for its 150ms exit. So for that window two views are mounted at once, and React propagates the
// router's context change into both. A view whose framing deps come from the URL therefore
// re-renders under the NEXT route, and re-runs its effect for a level it no longer shows.
//
// Concretely: leaving `/search?center=…` for an event, the exiting SearchView read its
// `?center`/`?bbox` as absent and called `frameSearch({})`. That reset the camera to the world a
// beat before the event framed. The visitor saw the map zoom out to the whole planet, then fly
// back in.
//
// The harness below IS that shape — a view mounted at `/search` that stays mounted across the
// navigation — rather than a mock of AnimatePresence, which could not fail.
//
// Deliberately no @testing-library/react. React 18.3 exports `act`, and `createRoot` is enough.
import type { MapController } from '@/hooks/use-map-controller'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate, useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MapControllerContext } from '@/hooks/use-map-controller'
import { useFrameOnTop } from '@/views/shared'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

// `hasMap: true` so the guard resolves `topViewKey` the way the real map build does, and so the
// POP/restore branch is reachable. Only `restore` is ever consulted here.
const controller = (restore = vi.fn()): MapController =>
  ({
    hasMap: true,
    restore,
    frameRegion: vi.fn(),
    frameEvent: vi.fn(),
    highlightEvent: vi.fn(),
    frameSearch: vi.fn(),
    reset: vi.fn(),
  }) as unknown as MapController

/**
 * Stands in for SearchView: the one view whose framing deps come off the URL, and so the only
 * one that re-runs its effect when the location changes underneath it.
 */
function SearchLike({ onFrame }: { onFrame: (label: string) => void }) {
  const [searchParams] = useSearchParams()

  useFrameOnTop(() => onFrame('search'), [onFrame, searchParams.get('center')])

  return null
}

function Harness({ onFrame, to }: { onFrame: (label: string) => void; to: string }) {
  const navigate = useNavigate()

  return (
    <>
      <button type="button" onClick={() => navigate(to)}>
        go
      </button>
      {/* Never unmounted — which is precisely what AnimatePresence does to the outgoing view
          for the length of its exit animation. */}
      <SearchLike onFrame={onFrame} />
    </>
  )
}

const mount = (onFrame: (label: string) => void, from: string, to: string) => {
  const root = createRoot(container)

  act(() => {
    root.render(
      <MapControllerContext.Provider value={controller()}>
        <MemoryRouter initialEntries={[from]}>
          <Harness to={to} onFrame={onFrame} />
        </MemoryRouter>
      </MapControllerContext.Provider>,
    )
  })

  return root
}

const clickGo = () => {
  act(() => {
    container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('useFrameOnTop', () => {
  it('does not frame from a view that is no longer on top', () => {
    const onFrame = vi.fn()
    const root = mount(onFrame, '/search?center=4.9,52.3', '/india/pune/507')

    expect(onFrame).toHaveBeenCalledTimes(1) // the mount framing

    clickGo()

    // The still-mounted SearchLike has re-rendered under the event's URL and its `?center` dep
    // has gone from '4.9,52.3' to null, so its effect ran again. It must not have framed: the
    // event owns the camera now.
    expect(onFrame).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })

  // The case that rules out every cheaper guard. `location.key` changes on a re-search and so
  // does the location itself, so "did the location change" would mute the framing that MUST
  // happen — the same view, pointed at a new place.
  it('still frames when the same view is re-searched', () => {
    const onFrame = vi.fn()
    const root = mount(onFrame, '/search?center=4.9,52.3', '/search?center=2.35,48.85')

    expect(onFrame).toHaveBeenCalledTimes(1)

    clickGo()

    expect(onFrame).toHaveBeenCalledTimes(2)

    act(() => root.unmount())
  })
})
