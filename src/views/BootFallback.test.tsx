import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import {
  BootFallback,
  ClassListSkeleton,
  PlaceListSkeleton,
  guessListsPlaces,
} from './BootFallback'

// Node-only SSR assertions (see `docs/testing.md`). Every key renders as itself.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const boot = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <BootFallback />
    </MemoryRouter>,
  )

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('the loading lists', () => {
  it.each([
    ['places', <PlaceListSkeleton key="places" />],
    ['classes', <ClassListSkeleton key="classes" />],
  ])('say "Finding classes…" once, as a status, and hide the rows (%s)', (_, list) => {
    const html = renderToStaticMarkup(list)

    expect(count(html, 'role="status"')).toBe(1)
    expect(html).toContain('common.a11y.finding_classes')
    expect(html).toContain('aria-hidden="true"')
  })

  it('mark themselves as loading, so the sheet does not fit them', () => {
    expect(renderToStaticMarkup(<PlaceListSkeleton />)).toContain('data-sy-loading')
    expect(renderToStaticMarkup(<ClassListSkeleton />)).toContain('data-sy-loading')
  })
})

describe('guessListsPlaces', () => {
  it.each([
    ['/gb', undefined, true],
    ['/gb/south-east', undefined, true],
    ['/gb/south-east/london', undefined, false],
    // A city directly under its country guesses wrong until the region tree says otherwise.
    ['/cz/prague', undefined, true],
    ['/cz/prague', 'city', false],
    ['/gb/south-east/london', 'region', true],
  ] as const)('%s at level %s lists places: %s', (path, level, places) => {
    expect(guessListsPlaces(path, level)).toBe(places)
  })
})

describe('BootFallback', () => {
  it('opens the first screen as its field and flagged country rows', () => {
    const html = boot('/')

    expect(html).not.toMatch(/<input[\s>]/)
    expect(html).toContain('lucide-funnel')
    expect(count(html, 'h-full w-full rounded-full')).toBeGreaterThan(0)
  })

  it('opens a city as class cards under what RegionView says over them', () => {
    const html = boot('/gb/south-east/london')

    expect(html).toContain('lucide-calendar-days')
    expect(html).toContain('common.chrome.all_classes_free')
  })

  it('opens a region as place rows', () => {
    const html = boot('/gb/south-east')

    expect(html).not.toContain('lucide-calendar-days')
    expect(html).not.toContain('common.chrome.all_classes_free')
    expect(html).toContain('lucide-chevron-right')
  })

  it('leaves Register out of a class on the phone sheet, which pins it to its foot', () => {
    const html = boot('/gb/south-east/london/1817')

    expect(html).toContain('common.a11y.loading')
    expect(html).not.toContain('h-10 w-full rounded-lg')
  })
})
