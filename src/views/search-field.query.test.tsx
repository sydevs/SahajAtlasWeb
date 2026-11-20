// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchField } from './shared'

// `?q` belongs to the header's own wrapper, and only a mounted component would write it on change.
// `MapSearch` itself holds no text. The geocoder is stood in for at the vendor boundary by a plain
// callback.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const typed = vi.hoisted(() => ({ change: (_value: string) => {}, shown: '' }))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ onChange, value }: { onChange: (value: string) => void; value: string }) => {
    typed.change = onChange
    typed.shown = value

    return null
  },
}))
vi.mock('react-map-gl/mapbox', () => ({ useMap: () => ({}) }))

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
        <MemoryRouter initialEntries={['/search?q=London']}>
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

  // The cards read their "from" place off `?q`, so half-typed text there said "5.1 km from Prag"
  // over London's classes. Only a picked place moves it.
  it('leaves ?q alone while the visitor types', async () => {
    expect(await type('Prag')).toBe('London')
    expect(typed.shown).toBe('Prag')
  })
})
