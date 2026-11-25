import type { ReactNode } from 'react'
import type { StackEntry } from '@/lib/shape/path'
import type { RegionLevel } from '@/types'

import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Funnel } from 'lucide-react'

// ⚠ By leaf path throughout: `BootFallback` renders before the interface's code has arrived, so
// this module sits in the eager graph, and a barrel here would carry the whole interface into it.
import { controlSurface } from '@/components/atoms/Button/Button'
import { drawer, inPlaceTransform } from '@/components/atoms/Drawer/drawer-style'
import { Skeleton, SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton/Skeleton'
import { LOADING } from '@/components/atoms/Skeleton/loading'
import { List } from '@/components/molecules/List/List'
import { ListToolbar } from '@/components/molecules/ListToolbar/ListToolbar'
import { ListItemSkeleton } from '@/components/molecules/ListItem/ListItemSkeleton'
import { EventListItemSkeleton } from '@/components/molecules/EventListItem/EventListItemSkeleton'
import {
  EventDetailsSkeleton,
  EventHeaderSkeleton,
} from '@/components/organisms/EventDetails/EventDetailsSkeleton'
import { MapSearchSkeleton } from '@/components/organisms/Mapbox/MapSearchSkeleton'
import { SHEET_OPEN_PX, shortSheetCap, useIsShortViewport, useIsWide } from '@/config/responsive'
import { guessListsPlaces } from '@/lib/shape/hierarchy'
import { baseStackEntry, resolveStack } from '@/lib/shape/path'
import {
  FIELD_SLOT,
  HEADER_CONTROL,
  HEADER_EDGE,
  NAV_HEADER,
  NAV_ROW,
  SUBTITLE,
  TITLE,
} from '@/views/chrome-style'

// The loading states' shapes, shared by the boot panel (before the interface's code arrives) and
// the drawer's own loading chrome (`views/fallbacks.tsx`), so the hand-over from one to the other
// changes nothing on screen.

/** A view's title that needs no data, by its kind: the same words the view itself shows. */
export const STATIC_TITLES: Partial<Record<StackEntry['kind'], [key: string, english: string]>> = {
  online: ['online.title', 'Online Classes'],
  search: ['search.chrome.title', 'Search'],
  calendar: ['calendar.title', 'Calendar'],
  filters: ['filters.chrome.title', 'Filters'],
  register: ['registration.form.title', 'Register for Meditation'],
  share: ['share.title', 'Share Meditation'],
}

/** A loading state says what it is waiting for once, in words, beside its hidden shapes. */
function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <p className="sr-only" role="status">
      {children}
    </p>
  )
}

function LoadingList({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div {...LOADING}>
      {/* Spoken, not drawn: a visible line would leave a gap the list then closes. */}
      <LoadingStatus>{t('common.a11y.finding_classes')}</LoadingStatus>
      <Skeleton>
        <List>{children}</List>
      </Skeleton>
    </div>
  )
}

/** A list of places on its way, as `ListItem` rows. */
export function PlaceListSkeleton({ icons = false }: { icons?: boolean }) {
  return (
    <LoadingList>
      {['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5', 'w-1/4', 'w-1/3'].map((width, row) => (
        <ListItemSkeleton key={row} icon={icons} width={width} />
      ))}
    </LoadingList>
  )
}

/** A list of classes on its way, as `EventListItem` cards. */
export function ClassListSkeleton({ online = false }: { online?: boolean }) {
  return (
    <LoadingList>
      {['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3'].map((width) => (
        <EventListItemSkeleton key={width} online={online} width={width} />
      ))}
    </LoadingList>
  )
}

/** `NavRow` before the interface can say where Back goes: the row, at its height, with a bar. */
function NavRowSkeleton() {
  return (
    <Skeleton className={NAV_ROW}>
      <SkeletonLine className="text-sm" width="w-36" />
    </Skeleton>
  )
}

/**
 * `DrawerTitle` before its name is known: the title's line as a bar, and the line under it where
 * that needs no data. No heading: a heading with nothing in it is worse than none.
 */
export function TitleSkeleton({ subtitle }: { subtitle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <Skeleton>
        <SkeletonLine className={TITLE} width="w-1/2" />
      </Skeleton>
      {subtitle && <div className={SUBTITLE}>{subtitle}</div>}
    </div>
  )
}

/** Whether a view has a body worth drawing ahead of it; where not, a neutral wait stands. */
export const hasLoadingBody = (entry: StackEntry | undefined): boolean =>
  !entry || ['region', 'online', 'search', 'event'].includes(entry.kind)

/**
 * The body a loading view stands in with, by its kind (`hasLoadingBody`).
 *
 * `level` is the place's, once the region tree has it. `ctaInline` is false where Register pins to
 * the phone sheet's foot once the class arrives, so the placeholder leaves it out.
 */
export function LoadingBody({
  entry,
  level,
  ctaInline,
}: {
  entry: StackEntry | undefined
  level?: RegionLevel
  ctaInline: boolean
}) {
  const { t } = useTranslation()

  switch (entry?.kind) {
    case undefined:
      return <PlaceListSkeleton icons />
    case 'region':
      return guessListsPlaces(entry.path, level) ? <PlaceListSkeleton /> : <ClassListSkeleton />
    case 'online':
      return <ClassListSkeleton online />
    case 'search':
      return <ClassListSkeleton />
    case 'event':
      return (
        <div {...LOADING}>
          <LoadingStatus>{t('common.a11y.loading')}</LoadingStatus>
          <EventDetailsSkeleton ctaInline={ctaInline} />
        </div>
      )
    default:
      return null
  }
}

/** A header control drawn inert: the real control's box, so the field beside it is its width. */
function ControlShape({ children, edge = false }: { children: ReactNode; edge?: boolean }) {
  return (
    <span
      aria-hidden
      className={controlSurface({ ...HEADER_CONTROL, className: edge ? HEADER_EDGE : undefined })}
    >
      {children}
    </span>
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
  const shortViewport = useIsShortViewport()
  const { pathname } = useLocation()
  const entry = baseStackEntry(resolveStack(pathname))
  // The calendar opens full width on a computer and near full on a phone; every other view at
  // the sheet's open stop, capped on a short window as the sheet is.
  const calendar = entry?.kind === 'calendar'
  const slots = drawer({ direction: isWide ? 'left' : 'bottom', mode: 'anchored', wide: calendar })
  const stop = calendar
    ? 0.97
    : `${shortViewport ? Math.min(SHEET_OPEN_PX, shortSheetCap()) : SHEET_OPEN_PX}px`
  const field = (
    <div className={FIELD_SLOT}>
      <MapSearchSkeleton />
    </div>
  )

  let header: ReactNode

  switch (entry?.kind) {
    case undefined:
      // CountriesView's header: the field, then Filters.
      header = (
        <div className={slots.header()}>
          {field}
          <ControlShape edge>
            <Funnel size={20} />
          </ControlShape>
        </div>
      )
      break
    case 'search':
      // SearchView's header and its Filters and Sort row.
      header = (
        <>
          <div className={slots.header()}>
            <ControlShape>
              <ChevronLeft className="rtl:-scale-x-100" size={20} />
            </ControlShape>
            {field}
          </div>
          <Skeleton className={slots.toolbar()}>
            <ListToolbar>
              <SkeletonBlock className="h-8 w-24" />
              <SkeletonBlock className="h-8 w-24" />
            </ListToolbar>
          </Skeleton>
        </>
      )
      break
    case 'event':
      header = <EventHeaderSkeleton nav={<NavRowSkeleton />} />
      break
    default: {
      const words = entry && STATIC_TITLES[entry.kind]
      const classes = entry?.kind === 'region' && !guessListsPlaces(entry.path, undefined)

      header = (
        <div className={slots.header({ className: NAV_HEADER })}>
          <NavRowSkeleton />
          {words ? (
            <div className={TITLE}>{t(words[0], { defaultValue: words[1] })}</div>
          ) : (
            <TitleSkeleton
              // What RegionView says over a place's classes, which needs no data.
              subtitle={classes ? t('common.chrome.all_classes_free') : undefined}
            />
          )}
        </div>
      )
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-3">
      <div
        className={slots.content()}
        // Where vaul will place the sheet, so the real one takes over without moving.
        style={isWide ? undefined : { transform: `translate3d(0, ${inPlaceTransform(stop)}, 0)` }}
      >
        {/* vaul's own handle styling (`styles/vaul.css`), on the element it would draw. */}
        {!isWide && <div aria-hidden className={slots.handle()} data-vaul-handle="" />}
        {header}
        <div className={slots.body()}>
          {hasLoadingBody(entry) && <LoadingBody ctaInline={isWide} entry={entry} />}
        </div>
      </div>
    </div>
  )
}
