import type { ReactNode } from 'react'
import type { RegionLevel } from '@/types'

import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Funnel } from 'lucide-react'

// ⚠ By leaf path throughout: this renders before the interface's code has arrived, so it sits in
// the eager graph, and a barrel here would carry the whole interface into it.
import { drawer } from '@/components/atoms/Drawer/drawer-style'
import { Skeleton, SkeletonLine } from '@/components/atoms/Skeleton/Skeleton'
import { List } from '@/components/molecules/List/List'
import { ListItemSkeleton } from '@/components/molecules/ListItem/ListItemSkeleton'
import { EventListItemSkeleton } from '@/components/molecules/EventListItem/EventListItemSkeleton'
import {
  EventDetailsSkeleton,
  EventHeaderSkeleton,
} from '@/components/organisms/EventDetails/EventDetailsSkeleton'
import { MapSearchSkeleton } from '@/components/organisms/Mapbox/MapSearchSkeleton'
import { SHEET_OPEN_PX, useIsWide } from '@/config/responsive'
import { listsPlaces } from '@/lib/shape/hierarchy'
import { resolveStack } from '@/lib/shape/path'
import { LOADING_ATTR } from '@/views/DrawerStack/use-fit-snap'

const LOADING = { [LOADING_ATTR]: '' }

/**
 * Whether a place's page lists places (a country's, a region's) rather than classes. Its level
 * says, once the region tree has it; before then the route guesses, since nothing three levels
 * down lists places. Wrong only for a city directly under its country (`/cz/prague`), which
 * shows place rows a moment before its class cards.
 */
export const guessListsPlaces = (path: string, level: RegionLevel | undefined): boolean =>
  level ? listsPlaces(level) : path.split('/').filter(Boolean).length < 3

/**
 * Said once while a list is on its way, in place of the rows drawn on screen. Spoken, not drawn:
 * a visible line would leave a gap the list then closes.
 */
function FindingClasses() {
  const { t } = useTranslation()

  return (
    <p className="sr-only" role="status">
      {t('common.a11y.finding_classes')}
    </p>
  )
}

/** Row widths, so a column of placeholders doesn't read as one block. */
const ROW_WIDTHS = ['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5', 'w-1/4', 'w-1/3', 'w-1/2']

/** A list of places on its way, as `ListItem` rows. */
export function PlaceListSkeleton({ icons = false, rows = 6 }: { icons?: boolean; rows?: number }) {
  return (
    <div {...LOADING}>
      <FindingClasses />
      <Skeleton>
        <List>
          {ROW_WIDTHS.slice(0, rows).map((width, row) => (
            <ListItemSkeleton key={row} icon={icons} width={width} />
          ))}
        </List>
      </Skeleton>
    </div>
  )
}

/** A list of classes on its way, as `EventListItem` cards. */
export function ClassListSkeleton({ online = false }: { online?: boolean }) {
  return (
    <div {...LOADING}>
      <FindingClasses />
      <Skeleton>
        <List>
          {['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3'].map((width) => (
            <EventListItemSkeleton key={width} online={online} width={width} />
          ))}
        </List>
      </Skeleton>
    </div>
  )
}

/** `NavRow` before the interface can say where Back goes: the row, at its height, with a bar. */
function NavRowSkeleton() {
  return (
    <Skeleton className="mb-2 flex min-h-8 items-center">
      <SkeletonLine className="text-sm" width="w-36" />
    </Skeleton>
  )
}

/**
 * What the full-window map form shows before its code has arrived: the drawer, from the drawer's
 * own geometry and at the stop it opens at, over a plain map-toned surface, holding the shapes of
 * the view the route opens. The real map replaces the surface, and the real drawer — which opens
 * in place (`enterInPlace`) — replaces the panel, without a slide.
 *
 * Only for the form that fills the window. A form with a box of its own keeps `LoadingFallback`,
 * since taking the viewport there would paint over the host's page.
 */
export function BootFallback() {
  const { t } = useTranslation()
  const isWide = useIsWide(null)
  const { pathname } = useLocation()
  const entry = resolveStack(pathname).at(-1)
  const slots = drawer({ direction: isWide ? 'left' : 'bottom', mode: 'anchored' })

  let header: ReactNode
  let body: ReactNode

  switch (entry?.kind) {
    case undefined:
      // CountriesView: the field and Filters, over the flagged countries.
      header = (
        <div className={slots.header()}>
          <div className="min-w-0 flex-1">
            <MapSearchSkeleton />
          </div>
          <span aria-hidden className="flex h-8 w-8 items-center justify-center last:-me-1.5">
            <Funnel size={20} />
          </span>
        </div>
      )
      body = <PlaceListSkeleton icons />
      break
    case 'event':
      header = <EventHeaderSkeleton nav={<NavRowSkeleton />} />
      body = (
        <div {...LOADING}>
          <p className="sr-only" role="status">
            {t('common.a11y.loading')}
          </p>
          {/* The phone sheet pins Register to its foot once the class arrives. */}
          <EventDetailsSkeleton ctaInline={isWide} />
        </div>
      )
      break
    default: {
      // A place, its online classes or a search: Back, the title, then its list. Nothing three
      // levels down lists places, so a city loads as class cards.
      const places = entry?.kind === 'region' && entry.path.split('/').filter(Boolean).length < 3

      header = (
        <div className={slots.header({ className: 'flex-col items-stretch gap-0' })}>
          <NavRowSkeleton />
          <Skeleton>
            <SkeletonLine className="text-xl" width="w-1/2" />
          </Skeleton>
          {/* What RegionView says over a place's classes, which needs no data. */}
          {entry?.kind === 'region' && !places && (
            <div className="truncate text-sm text-gray-11">
              {t('common.chrome.all_classes_free')}
            </div>
          )}
        </div>
      )
      body = places ? (
        <PlaceListSkeleton />
      ) : (
        <ClassListSkeleton online={entry?.kind === 'online'} />
      )
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-3">
      <div
        className={slots.content()}
        // The sheet's opening stop, as vaul would place it.
        style={
          isWide ? undefined : { transform: `translate3d(0, calc(100% - ${SHEET_OPEN_PX}px), 0)` }
        }
      >
        {!isWide && (
          <div
            aria-hidden
            className={slots.handle({ className: 'mx-auto h-[5px] w-8 rounded-2xl' })}
          />
        )}
        {header}
        <div className={slots.body()}>{body}</div>
      </div>
    </div>
  )
}
