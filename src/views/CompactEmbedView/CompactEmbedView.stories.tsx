import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { CompactState } from '@/lib/slot-decision'
import type { CalendarSourceEvent } from '@/lib/shape'
import type { Event, EventSlim, Region, RegionListItem } from '@/types'

import { CompactEmbedView } from './CompactEmbedView'

import { mockEventVariants, ViewHarness } from '@/views/story-harness'
import { CalendarView } from '@/views/CalendarView/CalendarView'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { EventView } from '@/views/EventView/EventView'
import { RegionView } from '@/views/RegionView/RegionView'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { eventsQuery } from '@/config/api'
import { DEFAULT_FILTERS, filtersKey } from '@/lib/shape'
import { mockEvent } from '@/mocks/events'
import { mockCountries, mockCountryRegion } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const INTERFACES = ['Countries', 'Search', 'Region', 'Event', 'Calendar'] as const

type InterfaceKey = (typeof INTERFACES)[number]

// Where the map starts when no search has moved it — the same default `SearchView` reads.
const DEFAULT_CENTER: [number, number] = [0, 20]

/** Seed every key the chosen interface reads, so none of them reaches the absent backend. */
function seedFor(view: InterfaceKey, locale: string) {
  return (client: QueryClient) => {
    client.setQueryData<RegionListItem[]>(['countries'], mockCountries)
    client.setQueryData<Region>(['region', mockCountryRegion.slug, locale], mockCountryRegion)
    client.setQueryData<Event>(['event', mockEvent.id, locale], mockEvent)
    client.setQueryData<EventSlim[]>(
      eventsQuery(DEFAULT_CENTER[1], DEFAULT_CENTER[0], DEFAULT_FILTERS, locale).queryKey,
      mockEventVariants,
    )
    client.setQueryData<CalendarSourceEvent[]>(
      ['calendar', filtersKey(DEFAULT_FILTERS), locale],
      [],
    )

    if (view === 'Calendar') {
      // The calendar expands its own occurrences, and an empty feed is a legitimate month.
      client.setQueryData<CalendarSourceEvent[]>(
        ['calendar', filtersKey(DEFAULT_FILTERS), locale],
        [],
      )
    }
  }
}

function Interface({ view }: { view: InterfaceKey }) {
  switch (view) {
    case 'Search':
      return <SearchView />
    case 'Region':
      return <RegionView slug={mockCountryRegion.slug} />
    case 'Event':
      return <EventView basePath={mockEvent.path} id={mockEvent.id} />
    case 'Calendar':
      return <CalendarView />
    default:
      return <CountriesView />
  }
}

/** A host page, so the embed is seen where it actually lives rather than on a blank canvas. */
function HostPage({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 p-8 font-serif text-[15px] leading-relaxed text-gray-12">
      <h1 className="text-3xl font-sans font-bold">Learning to meditate</h1>
      <p>
        This is a page on somebody else&rsquo;s website — a national Sahaja Yoga site, a local
        centre, a WordPress blog. The widget is embedded in the sidebar below, in whatever column
        their theme gave it.
      </p>
      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-4">
          <p>
            When that column is too narrow for the interface, the widget stops trying to fit one in
            and shows the card on the right instead. It is the whole embed at that size: one
            control, no data requests, and the interface a press away.
          </p>
          <p>
            Press it. The dialog keeps a margin, so this page stays visible behind it and the widget
            reads as a layer over the site rather than a departure from it — Escape, the &times;, or
            a click on the margin all bring you back here.
          </p>
          <p>
            A framed embed cannot grow in place, so there the same control is an anchor to a page
            that fits, opened in a new tab.
          </p>
        </div>
        <aside className="w-[280px] shrink-0">{children}</aside>
      </div>
    </article>
  )
}

/**
 * CompactEmbedView — what the widget IS in a host slot too small for the interface (issue #161):
 * a card with one control, and the dialog that control opens onto the real interface.
 */
export const Default: Story<{ view: InterfaceKey; inContext: boolean; map: boolean }> = ({
  view,
  inContext,
  map,
}) => {
  const { locale } = useLocale()
  const compact: CompactState = { action: { kind: 'overlay' }, autoOpen: false }

  const embed = (
    <CompactEmbedView compact={compact}>
      <ViewHarness
        height="container"
        map={map}
        seed={seedFor(view, locale)}
        seedKey={`${view}·${map}`}
      >
        <Interface view={view} />
      </ViewHarness>
    </CompactEmbedView>
  )

  if (inContext) return <HostPage>{embed}</HostPage>

  // No host page: the embed gets the whole canvas, so how it sizes and positions itself in an
  // unconstrained slot is the thing on screen.
  return <div className="h-screen w-full">{embed}</div>
}

Default.storyName = 'Compact Embed'
Default.args = { view: 'Countries', inContext: false, map: true }
Default.argTypes = {
  view: {
    name: 'Interface',
    options: [...INTERFACES],
    control: { type: 'select' },
    defaultValue: 'Countries',
  },
  inContext: { name: 'In context', control: { type: 'boolean' }, defaultValue: false },
  map: { name: 'Map', control: { type: 'boolean' }, defaultValue: true },
}
