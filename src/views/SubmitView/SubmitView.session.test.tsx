// @vitest-environment jsdom
import type { SubmitEntry } from '@/lib/shape'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, type NavigateFunction, useNavigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SubmitPanel } from './SubmitView'

import { useListingDraft } from '@/config/store'

// The step panel's sheet remounts when the widget crosses its breakpoint. Whether the session
// survives that is a mount-and-remount question, which only a mounted tree can answer.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const entry: SubmitEntry = { kind: 'add', regionSlug: null, path: '/add' }
let navigate: NavigateFunction = () => {}

function Navigator() {
  navigate = useNavigate()

  return null
}

const client = new QueryClient()
let root: ReturnType<typeof createRoot>

const render = (panel: boolean) =>
  act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/add']}>
          <Navigator />
          {panel && <SubmitPanel entry={entry} />}
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  )

describe('the listing session', () => {
  beforeEach(() => {
    useListingDraft.setState({ key: null, entry: null, draft: null, sent: false })
    root = createRoot(document.createElement('div'))
  })
  afterEach(() => act(() => root.unmount()))

  it('keeps a sent receipt when the panel remounts on the same visit', async () => {
    await render(true)
    act(() => useListingDraft.getState().markSent())
    await render(false)
    await render(true)

    expect(useListingDraft.getState().sent).toBe(true)
  })

  it('keeps an in-progress draft and its review state across a remount', async () => {
    await render(true)
    act(() => {
      useListingDraft.getState().update({ room: 'Hall B' })
      useListingDraft.getState().setStep('review')
      useListingDraft.getState().setStep('when')
    })
    await render(false)
    await render(true)

    expect(useListingDraft.getState()).toMatchObject({ step: 'when', reviewed: true })
    expect(useListingDraft.getState().draft?.room).toBe('Hall B')
  })

  it('starts a new listing when the flow is opened again after sending', async () => {
    await render(true)
    act(() => useListingDraft.getState().markSent())
    await render(false)
    await act(async () => navigate('/'))
    await act(async () => navigate('/add'))
    await render(true)

    expect(useListingDraft.getState().sent).toBe(false)
  })
})
