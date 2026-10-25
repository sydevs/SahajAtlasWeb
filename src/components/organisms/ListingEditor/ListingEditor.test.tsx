// @vitest-environment jsdom
//
// A DOM, because what is covered here is the surface reacting to taps: a slot opening its
// editor, Done holding or closing it, Undo restoring a section. SSR markup reaches none of it.
import type { ListingDraft, ListingStep } from '@/lib/proposal'

import { act, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ListingEditor } from './ListingEditor'

import { IpLookupContext } from '@/hooks/use-ip-location'
import { draftPreviewSchedule, emptyDraft, nextWeekdayDate, previewEvent } from '@/lib/proposal'

vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))
// The geocoder is a custom element and the map a WebGL canvas; neither is under test here.
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const place = {
  label: '12 Church Road, Hove',
  street: '12 Church Road',
  city: 'Hove',
  latitude: 50.83,
  longitude: -0.17,
  location: {},
}

let container: HTMLDivElement
let latest: ListingDraft

function Harness({
  initial,
  base,
  open: opened = 'review',
}: {
  initial: ListingDraft
  base?: ListingDraft
  open?: ListingStep
}) {
  const [draft, setDraft] = useState(initial)
  const [open, setOpen] = useState<ListingStep>(opened)
  const [attempted, setAttempted] = useState<string[]>([])
  const listing = useMemo(
    () => previewEvent(draft, { path: '/add', schedule: draftPreviewSchedule(draft) }),
    [draft],
  )

  latest = draft

  return (
    <ListingEditor
      attempted={attempted as never}
      base={base}
      draft={draft}
      listing={listing}
      open={open}
      onAttempt={(key) => setAttempted((current) => [...current, key])}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onOpen={setOpen}
    />
  )
}

async function mount(props: Parameters<typeof Harness>[0]) {
  const root = createRoot(container)

  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <IpLookupContext.Provider value={false}>
            <Harness {...props} />
          </IpLookupContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  )

  return root
}

const button = (name: RegExp | string) => {
  const found = [...container.querySelectorAll('button')].find((candidate) =>
    typeof name === 'string'
      ? candidate.textContent === name || candidate.getAttribute('aria-label') === name
      : name.test(candidate.textContent ?? '') ||
        name.test(candidate.getAttribute('aria-label') ?? ''),
  )

  if (!found) throw new Error(`no button ${name}`)

  return found
}

const press = (name: RegExp | string) => act(async () => button(name).click())

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  vi.unstubAllGlobals()
})

describe('ListingEditor', () => {
  it('starts as invitations, and claims nothing the visitor has not said', async () => {
    const root = await mount({ initial: emptyDraft('Europe/London') })

    // Where and When are asked for, not asserted: no class type before there is a schedule.
    expect(container.textContent).toContain('submit.where.title')
    expect(container.textContent).toContain('submit.when.title')
    expect(container.textContent?.match(/submit\.chrome\.required/g)).toHaveLength(2)
    expect(container.textContent).not.toContain('event.display.contact_host')

    await act(async () => root.unmount())
  })

  it('opens a section in place, and a weekday becomes the next such date', async () => {
    const root = await mount({ initial: emptyDraft('Europe/London') })

    await press(/submit\.when\.title/)
    expect(container.querySelector('#submit-start-time')).not.toBeNull()

    const tuesday = container.querySelector<HTMLButtonElement>('[aria-label="Tuesday"]')

    await act(async () => tuesday?.click())
    expect(latest.firstDate).toBe(nextWeekdayDate(2, 'Europe/London'))

    await act(async () => root.unmount())
  })

  it('keeps a section open on Done while what was typed is wrong', async () => {
    const root = await mount({
      initial: { ...emptyDraft('Europe/London'), contactEmail: 'not-an-address' },
      open: 'contact',
    })

    await press('submit.chrome.done')
    expect(container.textContent).toContain('submit.errors.email')
    expect(container.querySelector('#submit-contact-email')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('closes an untouched section on Done without scolding', async () => {
    const root = await mount({ initial: emptyDraft('Europe/London'), open: 'where' })

    await press('submit.chrome.done')
    expect(container.textContent).not.toContain('submit.errors.address_required')
    expect(container.querySelector('#submit-room')).toBeNull()

    await act(async () => root.unmount())
  })

  it('marks what a correction changed, and Undo puts it back', async () => {
    const base = { ...emptyDraft('Europe/London'), address: place, room: 'Hall A' }
    const root = await mount({ initial: { ...base, room: 'Hall B' }, base })

    expect(container.textContent).toContain('submit.chrome.changed')
    await press('submit.chrome.undo')
    expect(latest.room).toBe('Hall A')
    expect(container.textContent).not.toContain('submit.chrome.changed')

    await act(async () => root.unmount())
  })
})
