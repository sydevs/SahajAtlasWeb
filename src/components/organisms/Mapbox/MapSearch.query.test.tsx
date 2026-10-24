// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapSearch, type MapSearchProps } from './MapSearch'

// Whether typing reaches `?q` is a write the field makes on change, which only a mounted
// component does. The geocoder is stood in for at the vendor boundary by a plain callback.
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

const type = async (query: MapSearchProps['query'], text: string) => {
  root = createRoot(document.createElement('div'))
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={['/search']}>
        <MapSearch query={query} onSelect={() => {}} />
        <Url />
      </MemoryRouter>,
    ),
  )
  await act(async () => typed.change(text))

  return new URLSearchParams(search).get('q')
}

describe('MapSearch writing ?q', () => {
  afterEach(() => act(() => root?.unmount()))

  it('mirrors what is typed into ?q in the default mode', async () => {
    expect(await type('url', 'Lisbon')).toBe('Lisbon')
  })

  it('never writes ?q as a form field, whatever is typed', async () => {
    expect(await type({ initial: '' }, 'url')).toBeNull()
  })

  it('never writes ?q in read-only mode', async () => {
    expect(await type('read-only', 'Lisbon')).toBeNull()
  })
})
