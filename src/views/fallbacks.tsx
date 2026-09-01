import type { FallbackProps } from 'react-error-boundary'
import type { FallbackAlign, FallbackKind } from '@/components/molecules'
import type { StackEntry } from '@/lib/shape'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { CENTERED_BODY, FallbackPanel, ListToolbar } from '@/components/molecules'
import { eventTitlesQuery, regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useLocale } from '@/hooks/use-locale'
import { classifyError, errorMessage } from '@/lib/report'
import { baseStackEntry, resolveStack } from '@/lib/shape'
import {
  CalendarButton,
  CloseButton,
  CollapseToggle,
  DrawerTitle,
  FilterButton,
  SearchButton,
  SearchField,
  useDrawerControl,
} from '@/views/shared'

/**
 * Whether this route's chrome leads with the geocoder rather than a title — the root and
 * the search view, which get the header their own view would render.
 *
 * Read by BOTH the chrome (to render the field) and the body (to suppress its own): a
 * `not-found` at `/` or `/search` is a DEAD_END row, which asks for a geocoder, so without
 * this the screen draws two. `docs/rules/i18n-and-state.md` states the invariant —
 * "`visibleActions` narrows by surface … a geocoder already in the chrome" — and this is
 * what implements it.
 */
const leadsWithGeocoder = (
  entry: StackEntry | undefined,
  // A type predicate, not a plain boolean: the chrome early-returns on it, and the code
  // after that return reads `entry.slug`/`entry.id` — so it has to narrow away `undefined`
  // and the search variant exactly as the inline check it replaced did.
): entry is undefined | Extract<StackEntry, { kind: 'search' }> => !entry || entry.kind === 'search'

// What a DRAWER adds around the shared fallback body — the chrome that survives when a
// view can't render, and the routing knowledge only a drawer has. What the body itself
// says and offers lives in one table (`ERROR_POLICY`, molecules/Fallbacks), shared with
// the app-level fallback and with every empty list.
//
// The governing rule, which every component here obeys: THE FALLBACK MUST NEVER THROW. It
// runs where a throw escapes to the app-level boundary and blanks the whole widget inside
// someone else's page, so it is built in layers and a failure in an outer one costs only
// that layer:
//
//   0 — the frame (`DrawerChrome`): a header + a working close control, rebuilt from the
//       URL and already-cached data. Only total calls — `t()` with `defaultValue`, a
//       context read, non-suspending cache reads, and `resolveStack`, which is pure.
//   1+2 — the message and the offer, layered inside `FallbackPanel` (see its doc comment).
//
// Split out of `views/shared.tsx` (issue #89), which had grown to hold the drawer
// controls, the search field, the geolocation suggestion AND all of this.

/**
 * A disabled stand-in for the geocoder: the same box, none of the machinery. Matches the
 * inert `<input>` `MapSearch` already falls back to when the Geocoder itself fails, so the
 * loading header is the right shape and the right height without mounting a custom element
 * that is about to be thrown away.
 */
function SearchFieldSkeleton() {
  const { t } = useTranslation('common', { useSuspense: false })

  return (
    <div className="min-w-0 flex-1">
      <input
        disabled
        readOnly
        className="w-full rounded-lg border border-divider bg-gray-2 px-3 py-2 text-sm text-foreground placeholder:text-gray-11"
        placeholder={t('search_placeholder', { defaultValue: 'Search for events near…' })}
        type="search"
        value=""
      />
    </div>
  )
}

/**
 * The header a drawer keeps when its view can't render — while loading, or after it threw.
 *
 * Every view renders its own `DrawerHeader` *inside* the boundary and below its
 * `useSuspenseQuery`, so a throw or a suspend erases the header and its close button along
 * with the content. That left an error state with no way out of the drawer at all
 * (issue #89), and a load with nothing on screen to say which thing was opening.
 *
 * Deriving the title from the URL + already-cached data — rather than from the query that
 * is failing or pending — is what makes this worth rendering instead of "Loading…".
 *
 * It cannot THROW: every lookup is a non-suspending cache read that degrades to
 * `undefined`, its own `t()` calls carry a `defaultValue`, and an unrecognised route simply
 * omits the title — a header with only a close control still beats no header.
 *
 * It can still SUSPEND, in one case, and that is deliberate rather than overlooked:
 * `useLocale()` reads i18next through a plain `useTranslation()`, so switching language
 * while this is on screen suspends here as it does everywhere else in the app. The controls
 * this renders all pass `useSuspense: false` so they don't add a second way to do it, but
 * making the locale read non-suspending is an app-wide decision, not this component's.
 */
export function DrawerChrome({ interactive = true }: { interactive?: boolean }) {
  const { t } = useTranslation('common', { useSuspense: false })
  const { t: tEvents } = useTranslation('events', { useSuspense: false })
  const { locale } = useLocale()
  const { hasMap } = useWidgetMode()
  const location = useLocation()
  const { canDismiss } = useDrawerControl()
  // Cache-only (`enabled: false`), not merely non-suspending: this renders on EVERY
  // loading and error state, so a fetch here would re-issue a read on exactly the failures
  // where the backend is already the problem. A miss costs the title, never the frame.
  // Both go through the shared factories so the keys can't drift from the ones the loaders
  // write — a cache-only read under a divergent key doesn't error, it silently misses.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: false })

  // Same peel DrawerStack applies: a trailing `filters` over a `calendar` is a separate
  // overlay drawer, so the BASE drawer's chrome must still name the calendar. Without this
  // a calendar that fails underneath an open filter overlay titles itself "Filters".
  const entry = baseStackEntry(resolveStack(location.pathname), hasMap)
  // The region tree is the whole global list, and this re-renders on every location and
  // drawer-control change, so don't re-scan it for a name that only moves with the slug.
  const regionName = useMemo(
    () =>
      entry?.kind === 'region'
        ? (regions?.find((node) => node.slug === entry.slug)?.name ?? undefined)
        : undefined,
    [regions, entry?.kind === 'region' ? entry.slug : undefined],
  )

  const title = (() => {
    switch (entry?.kind) {
      case 'region':
        return regionName
      case 'online':
        return t('online_classes', { defaultValue: 'Online Classes' })
      case 'event':
        return titles?.get(entry.id)
      case 'search':
        return t('search', { defaultValue: 'Search' })
      case 'calendar':
        return t('calendar.title', { defaultValue: 'Calendar' })
      case 'filters':
        return t('filters.title', { defaultValue: 'Filters' })
      case 'register':
        return tEvents('registration.register_meditation', {
          defaultValue: 'Register for Meditation',
        })
      case 'share':
        return tEvents('details.share_meditation', { defaultValue: 'Share Meditation' })
      default:
        return undefined
    }
  })()

  // At the root there is nothing to climb to and `navigate(-1)` would take the host page
  // back, so offer the collapse (which self-hides where it can't collapse) rather than a
  // close that silently does nothing.
  const dismiss = canDismiss ? <CloseButton /> : <CollapseToggle />

  // The root and the search view lead with the geocoder rather than a title, so they get
  // the header their view would render. Everything in it is a NAVIGATION — a new search, a
  // filter drawer — not a read of the data that failed, so none of it needs disabling: on
  // an `offline` search the field is the most useful thing on screen, since a new URL
  // remounts the boundary and may well succeed.
  if (leadsWithGeocoder(entry)) {
    return (
      <>
        <DrawerHeader>
          {/* A LOADING chrome gets the field's shape, not a working field. `SearchField`
              mounts a Mapbox Geocoder — a shadow-DOM custom element bound to the live map —
              and this fallback is freshly mounted per path inside DrawerStack's keyed
              motion.div, so on a cold start it would instantiate one while the map is still
              initialising and tear it down again the moment CountriesView mounts its own.
              An ERROR chrome keeps the real field: there it is the escape hatch.

              `syncToUrl={false}` for the same reason the BODY's field sets it: the only
              interactive case here is the error chrome, whose URL is the dead one we just
              reported — and embedded, that URL lives in the host page's `#!` fragment, so
              writing keystrokes into it spreads a broken link into anything the visitor
              copies. Selecting a place still navigates; only the `?q` echo is dropped. */}
          {interactive ? <SearchField syncToUrl={false} /> : <SearchFieldSkeleton />}
          {dismiss}
        </DrawerHeader>
        <DrawerToolbar>
          <ListToolbar>
            <FilterButton />
          </ListToolbar>
        </DrawerToolbar>
      </>
    )
  }

  return (
    <DrawerHeader className="justify-between">
      {/* An empty <div> rather than an empty DrawerTitle when nothing resolved: a blank
          <h2> is a heading with no name, which is worse for a screen reader than no
          heading at all. It still holds the left slot so the control stays right-aligned. */}
      {title ? <DrawerTitle title={title} /> : <div />}
      <div className="flex shrink-0 items-center gap-2">
        {/* A region's own header offers these two, and both still work — they navigate
            rather than read. The calendar is scoped to the region whose page failed, which
            is exactly where a viewer wanted to be. */}
        {entry.kind === 'region' && (
          <>
            <CalendarButton regionSlug={entry.slug} />
            <SearchButton />
          </>
        )}
        {entry.kind === 'online' && <SearchButton />}
        {entry.kind === 'calendar' && <FilterButton iconOnly />}
        {dismiss}
      </div>
    </DrawerHeader>
  )
}

// Suspense fallback for a view whose data is still loading — the shared chrome (so the
// drawer keeps its identity and its close control) over a spinner. `interactive={false}`:
// see `SearchFieldSkeleton`.
export function DrawerLoading() {
  return (
    <>
      <DrawerChrome interactive={false} />
      <DrawerLoadingBody />
    </>
  )
}

/**
 * The spinner alone, for a Suspense fence that sits BELOW a view's own header — the
 * calendar's grid. The chrome-ful `DrawerLoading` there would draw a second header, with a
 * second close button, under the one CalendarControls already renders.
 *
 * The loading counterpart of `DrawerErrorBody`/`ErrorPanel`: same split, same reason.
 */
export function DrawerLoadingBody() {
  const { t } = useTranslation('common', { useSuspense: false })

  return (
    <DrawerBody className={CENTERED_BODY}>
      {/* `srLabel`, not `label`: the word is announced, not drawn. A visible "Loading…" under
          the glyph says nothing a spinner does not already say, and it is what pushed the glyph
          itself off centre — the column centres, so the label's height sits half of it below the
          middle. Screen readers still get it through the Spinner's own `role="status"`. */}
      <Spinner color="secondary" srLabel={t('loading', { defaultValue: 'Loading…' })} />
    </DrawerBody>
  )
}

/**
 * Which posture the fallback takes in this view's body.
 *
 * The **list** views — the root country index, a region, its online roll-up, and search —
 * put content at the top-left of the body, so a fallback standing in for that list belongs
 * there too; centring it moves the sentence away from where the reader is already looking
 * and makes the drawer read as a different kind of screen. Everything else (an event, a
 * registration, a share sheet, the calendar) is a single composed panel with no such
 * anchor, so its fallback centres.
 *
 * Derived from the URL rather than passed down, because the view boundary's fallback is
 * mounted by `DrawerStack` — the failing view never gets to say anything about it. The
 * empty-list states call `FallbackPanel` directly and pass `align` themselves.
 */
const LIST_KINDS = new Set<StackEntry['kind']>(['region', 'online', 'search'])

const fallbackAlign = (kind: StackEntry['kind'] | undefined): FallbackAlign =>
  // `undefined` is the root — CountriesView, the country index, which is a list.
  kind === undefined || LIST_KINDS.has(kind) ? 'start' : 'center'

/**
 * Which noun a dead link should name. `not-found` ("what you were looking for") is the
 * honest generic, but the drawer always knows better than that — the URL says whether the
 * viewer was opening an event or a place, and `<event>/register` is still about the event.
 * Only the routes with no entity fall through to the generic.
 *
 * Each is a row of `ERROR_POLICY` rather than a message override, so the sentences live
 * beside every other one and the "fallbackText matches the shipped en copy" test covers
 * them too.
 */
const notFoundKind = (kind: StackEntry['kind'] | undefined): FallbackKind => {
  switch (kind) {
    case 'event':
    case 'register':
    case 'share':
      return 'not-found-event'
    case 'region':
    case 'online':
      return 'not-found-region'
    default:
      return 'not-found'
  }
}

/**
 * The error content itself, with no drawer wrapper — for a boundary that sits INSIDE a
 * view's existing `DrawerBody` (the results list, the lazy event details). Wrapping those
 * in a second `DrawerBody` would nest one scroll container inside another.
 *
 * Used wherever the view's own chrome is still on screen and still working, so the shared
 * `DrawerChrome` would be a duplicate header.
 *
 * All it adds to the shared `FallbackPanel` is the two things only a routed drawer knows:
 * which entity the dead link named, and a geocoder to name another one.
 */
export function ErrorPanel({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common', { useSuspense: false })
  const { hasMap } = useWidgetMode()
  const location = useLocation()
  const kind = classifyError(error)
  // The SAME entry the chrome above it names (`baseStackEntry`, not a raw `.at(-1)`) —
  // otherwise a calendar failing underneath an open filter overlay gets a header saying
  // "Calendar" over a body reasoning about "Filters".
  const entry = baseStackEntry(resolveStack(location.pathname), hasMap)

  return (
    <FallbackPanel
      align={fallbackAlign(entry?.kind)}
      // The root and search chromes already lead with a geocoder, and a dead link asks for
      // one — so without this the screen draws two: the header's and the body's. Same
      // predicate the chrome uses, so they can't disagree about which routes those are.
      hasSearchChrome={leadsWithGeocoder(entry)}
      kind={kind === 'not-found' ? notFoundKind(entry?.kind) : kind}
      // The thrown developer string is not the headline — it's untranslated text written
      // for us, rendered to a viewer inside someone else's page. It survives as report
      // context only (issue #89); `FallbackPanel` falls back to the sentence.
      reportContext={errorMessage(error) ?? undefined}
      resetErrorBoundary={resetErrorBoundary}
    >
      {/* `syncToUrl={false}`: this URL is the dead one we've just reported, and embedded
          it lives in the host page's `#!` fragment — writing keystrokes into it spreads
          a broken link into anything the visitor copies. */}
      <SearchField
        label={t('error.search_label', { defaultValue: 'Or search for a place' })}
        syncToUrl={false}
      />
    </FallbackPanel>
  )
}

/** `ErrorPanel` in its own `DrawerBody` — for a boundary whose child OWNS the body rather
 *  than living inside one (the calendar grid renders its own). */
export function DrawerErrorBody(props: FallbackProps) {
  return (
    <DrawerBody>
      <ErrorPanel {...props} />
    </DrawerBody>
  )
}

/**
 * ErrorBoundary fallback for a whole view — kept local to the drawer so one failing view
 * never blanks the stack. Mirrors the top-level ErrorFallback (molecules/Fallbacks): the
 * same classified copy and the same FallbackActions, differing only in chrome.
 *
 * Renders `DrawerChrome` above the body, because the view's own header went down with it.
 * Before that, an error left the drawer with no close button — and in the configurations
 * with no peek strips (desktop, map-less) no swipe and no Esc either, so the viewer was
 * stuck on the error screen with no way back to the map (issue #89).
 */
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <>
      <DrawerChrome />
      <DrawerErrorBody error={error} resetErrorBoundary={resetErrorBoundary} />
    </>
  )
}
