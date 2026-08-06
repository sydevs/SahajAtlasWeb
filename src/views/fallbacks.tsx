import type { FallbackProps } from 'react-error-boundary'
import type { StackEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { Alert } from '@/components/atoms/Alert'
import { Spinner } from '@/components/atoms/Spinner'
import { ErrorActions, ErrorRegion, NotFoundOffer, useErrorDisplay } from '@/components/molecules'
import { regionsQuery } from '@/config/api'
import { useRecoveryOffer } from '@/hooks/use-recovery-offer'
import { reportInternalError } from '@/lib/report'
import { baseStackEntry, resolveStack } from '@/lib/shape'
import {
  CloseButton,
  CollapseToggle,
  DrawerTitle,
  SearchField,
  useDrawerControl,
} from '@/views/shared'

// What a drawer shows when its view can't render — while loading, or after it threw.
//
// The governing rule, which every component here obeys: THE FALLBACK MUST NEVER THROW. It
// runs where a throw escapes to the app-level boundary and blanks the whole widget inside
// someone else's page, so it is built in layers and a failure in an outer one costs only
// that layer:
//
//   0 — the frame (`DrawerChrome`): a header + a working close control, rebuilt from the
//       URL and already-cached data. Only total calls — `t()` with `defaultValue`, a
//       context read, non-suspending cache reads, and `resolveStack`, which is pure.
//   1 — the message (`useErrorDisplay`): hardened at source, and falls back to the
//       `unknown` policy rather than dereferencing a missing one.
//   2 — the offer (`NotFoundPanel`): reads three caches and mounts a geocoder, so it sits
//       behind its OWN boundary and degrades to `RecoveryFloor` — a static link that needs
//       no data at all — reporting why via `reportInternalError`.
//
// Two registers, deliberately: a dead link is a wrong turn, not a malfunction, so
// `not-found` renders the neutral empty-state treatment (`role="status"`) with somewhere
// real to go, while everything else renders the danger alert (`role="alert"`) and the
// policy's buttons. Red chrome on a not-found means the two have drifted.
//
// Split out of `views/shared.tsx` (issue #89), which had grown to hold the drawer
// controls, the search field, the geolocation suggestion AND all of this.

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
 * Total by construction (rule: the fallback must never throw). Every lookup is a
 * non-suspending cache read that degrades to `undefined`, `t()` never suspends and always
 * carries a `defaultValue`, and an unrecognised route simply omits the title — a header
 * with only a close control still beats no header.
 */
export function DrawerChrome() {
  const { t, i18n } = useTranslation('common', { useSuspense: false })
  const { t: tEvents } = useTranslation('events', { useSuspense: false })
  const location = useLocation()
  const { canDismiss } = useDrawerControl()
  // Cache-only (`enabled: false`), not merely non-suspending: this renders on EVERY
  // loading and error state, so a fetch here would re-issue a read on exactly the failures
  // where the backend is already the problem. A miss costs the title, never the frame.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const { data: titles } = useQuery<Map<number, string>>({
    queryKey: ['event-titles', i18n.resolvedLanguage || 'en'],
    enabled: false,
  })

  // Same peel DrawerStack applies: a trailing `filters` over a `calendar` is a separate
  // overlay drawer, so the BASE drawer's chrome must still name the calendar. Without this
  // a calendar that fails underneath an open filter overlay titles itself "Filters".
  const entry = baseStackEntry(resolveStack(location.pathname))

  const title = (() => {
    switch (entry?.kind) {
      case 'region':
        return regions?.find((node) => node.slug === entry.slug)?.name ?? undefined
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

  return (
    <DrawerHeader className="justify-between">
      {/* An empty <div> rather than an empty DrawerTitle when nothing resolved: a blank
          <h2> is a heading with no name, which is worse for a screen reader than no
          heading at all. It still holds the left slot so the control stays right-aligned. */}
      {title ? <DrawerTitle title={title} /> : <div />}
      {/* At the root there is nothing to climb to and `navigate(-1)` would take the host
          page back, so offer the collapse (which self-hides where it can't collapse)
          rather than a close that silently does nothing. */}
      {canDismiss ? <CloseButton /> : <CollapseToggle />}
    </DrawerHeader>
  )
}

// Suspense fallback for a view whose data is still loading — the shared chrome (so the
// drawer keeps its identity and its close control) over a spinner.
//
// TOP-ALIGNED, not centred. `DrawerBody` fills a sheet that is `h-dvh` (vaul computes its
// snap translates off the window height), while the mobile sheet only shows its top 300px
// — so `items-center` put the spinner at roughly `1.5·viewport − 300` from the top, i.e.
// BELOW THE FOLD. Loading rendered as a blank sheet on every phone: "nothing happened when
// I tapped". Same fix, same reason, in DrawerErrorFallback below (issue #89).
export function DrawerLoading() {
  return (
    <>
      <DrawerChrome />
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
    <DrawerBody className="flex justify-center p-8">
      <Spinner color="secondary" label={t('loading', { defaultValue: 'Loading…' })} />
    </DrawerBody>
  )
}

/**
 * Which noun a dead link should name. `error.not_found` ("what you were looking for") is
 * the honest generic, but the drawer always knows better than that — the URL says whether
 * the viewer was opening an event or a place, and `<event>/register` is still about the
 * event. Only the routes with no entity fall through to the generic.
 */
const notFoundMessageKey = (kind: StackEntry['kind'] | undefined): string => {
  switch (kind) {
    case 'event':
    case 'register':
    case 'share':
      return 'error.not_found_event'
    case 'region':
    case 'online':
      return 'error.not_found_region'
    default:
      return 'error.not_found'
  }
}

/**
 * The dead-end body: what was missing, one place to go, and a field to name somewhere
 * else (issue #89).
 *
 * Separate component because it reads data (`useRecoveryOffer`) and mounts a Mapbox custom
 * element — the risky layer that `ErrorPanel` wraps in its own boundary below.
 */
function NotFoundPanel({ message }: { message: string }) {
  const { t } = useTranslation('common', { useSuspense: false })
  const offer = useRecoveryOffer()

  return (
    <ErrorRegion className="p-4" message={message}>
      <NotFoundOffer message={message} offer={offer}>
        {/* `syncToUrl={false}`: this URL is the dead one we've just reported, and embedded
            it lives in the host page's `#!` fragment — writing keystrokes into it spreads
            a broken link into anything the visitor copies. */}
        <SearchField
          label={t('error.search_label', { defaultValue: 'Search for a place' })}
          syncToUrl={false}
        />
      </NotFoundOffer>
    </ErrorRegion>
  )
}

/** The floor: no data, no hooks beyond `t`, so it can stand in when anything richer
 *  fails. Rendered by the boundary around `NotFoundPanel`. */
function RecoveryFloor({ message }: { message: string }) {
  return (
    <ErrorRegion className="p-4" message={message}>
      <NotFoundOffer message={message} offer={{ kind: 'countries', path: '/' }} />
    </ErrorRegion>
  )
}

/**
 * The error content itself, with no drawer wrapper — for a boundary that sits INSIDE a
 * view's existing `DrawerBody` (the results list, the lazy event details). Wrapping those
 * in a second `DrawerBody` would nest one scroll container inside another.
 *
 * Used wherever the view's own chrome is still on screen and still working, so the shared
 * `DrawerChrome` would be a duplicate header.
 *
 * Splits on register: a dead link gets the neutral empty-state treatment with somewhere to
 * go; everything else gets the danger alert and the policy's buttons.
 */
export function ErrorPanel({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common', { useSuspense: false })
  const location = useLocation()
  const { kind, policy, message, reportContext } = useErrorDisplay(error)

  if (kind === 'not-found') {
    const entityMessage = t(notFoundMessageKey(resolveStack(location.pathname).at(-1)?.kind), {
      defaultValue: message,
    })

    return (
      // Layer 2 of the never-fail rule: the offer reads three caches and mounts a geocoder,
      // any of which could throw — and this is the screen that exists to explain a failure,
      // so it must not become a second one. On a throw it degrades to the floor rung, which
      // needs no data at all. Not `null`: unlike the report modal (off screen until asked),
      // this IS the screen, so failing to nothing would strand the viewer.
      <ErrorBoundary
        fallbackRender={() => <RecoveryFloor message={entityMessage} />}
        onError={(cause) => reportInternalError(cause, 'NotFoundPanel')}
      >
        <NotFoundPanel message={entityMessage} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorRegion className="flex flex-col items-start gap-3 p-4" message={message}>
      <Alert align="start" className="max-w-xs" color="danger" description={message} role="alert" />
      <ErrorActions
        policy={policy}
        reportContext={reportContext}
        resetErrorBoundary={resetErrorBoundary}
      />
    </ErrorRegion>
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
 * same classified copy and the same ErrorActions, differing only in chrome.
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
