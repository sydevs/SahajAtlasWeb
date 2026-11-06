// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SearchField } from './shared'

// Whether typing reaches `?q` is a write the header's own wrapper makes on change, which only a
// mounted component does. `MapSearch` itself holds no text. The geocoder is stood in for at the
// vendor boundary by a plain callback.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const typed = vi.hoisted(() => ({ change: (_value: string) => {} }))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ onChange }: { onChange: (value: string) => void }) => {
    typed.change = onChange

    return null
  },
}))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

let search = ''

function Url() {
  search = useLocation().search

  return null
}

let root: ReturnType<typeof createRoot> | undefined

const type = async (text: string) => {
  root = createRoot(document.createElement('div'))
  await act(async () =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/search']}>
          <SearchField />
          <Url />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  )
  await act(async () => typed.change(text))

  return new URLSearchParams(search).get('q')
}

describe('SearchField and ?q', () => {
  afterEach(() => act(() => root?.unmount()))

  // Half-typed text in `?q` renamed everything that reads it (the place pill, the results heading,
  // each card's distance line) to "Prag". The URL changes only when a place is picked.
  it('never writes what is typed into ?q', async () => {
    expect(await type('Lisbon')).toBeNull()
  })
})
