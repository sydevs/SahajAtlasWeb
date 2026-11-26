// @vitest-environment jsdom
import type { GeocodingResponse } from '@mapbox/search-js-core'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MapSearch } from './MapSearch'

/**
 * jsdom, because the subject is a re-render over time: an answer, a pause, and the keystrokes in
 * between. The geocoder is a custom element that cannot mount here, so a stub hands the test the
 * two callbacks the real one calls.
 */

const geocoder = vi.hoisted(() => ({
  suggest: (_: unknown) => {},
  change: (_: string) => {},
}))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: (props: { onSuggest: (r: unknown) => void; onChange: (v: string) => void }) => {
    geocoder.suggest = props.onSuggest
    geocoder.change = props.onChange

    return null
  },
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-mapbox', () => ({ useMapbox: () => ({ mapbox: undefined }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/config/api', () => ({ default: {}, clientQuery: () => ({ queryKey: ['client'] }) }))

const NOT_FOUND = 'common.errors.not_found_region'
const nothing = { features: [] } as unknown as GeocodingResponse

let host: HTMLElement
const status = () => host.querySelector('[role="status"]')?.textContent ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  act(() =>
    createRoot(host).render(
      <MemoryRouter>
        <MapSearch onSelect={() => {}} />
      </MemoryRouter>,
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
  host.remove()
})

const type = (text: string) => act(() => geocoder.change(text))
const answerNothing = () => act(() => geocoder.suggest(nothing))
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('MapSearch — "We couldn\'t find that place"', () => {
  it('says so only once the empty answer has stood for a typing pause', () => {
    type('Xqzv')
    answerNothing()
    wait(299)
    expect(status()).toBe('')

    wait(1)
    expect(status()).toBe(NOT_FOUND)
  })

  it('says nothing for an empty answer the next keystroke replaces', () => {
    type('Xq')
    answerNothing()
    wait(150)
    type('Xqz')
    wait(300)

    expect(status()).toBe('')
  })

  it('withdraws the answer as soon as the text changes', () => {
    type('Xqzv')
    answerNothing()
    wait(300)
    type('Xqzvy')

    expect(status()).toBe('')
  })
})
