import type { ErrorBoundaryProps } from 'react-error-boundary'
import type { ReactNode } from 'react'
import type { ErrorKind } from '@/lib/report'
import type { RecoveryOffer } from '@/hooks/use-recovery-offer'

import { useEffect, useRef } from 'react'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { PhoneOutgoing } from 'lucide-react'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button, controlSurface } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { useReportModal } from '@/config/store'
import { useRecoveryOffer } from '@/hooks/use-recovery-offer'
import { classifyError, errorMessage, reportInternalError } from '@/lib/report'

/**
 * This is the whole-widget surface. It fills the embed when the app has no content to
 * show yet, or has lost its content.
 *
 * Both app-level fallbacks share this style. A stalled boot and a failed boot then look
 * the same to a viewer, one frame apart.
 *
 * The code keeps two separate components, not one, for a technical reason. `Suspense`
 * takes an ELEMENT (`fallback={<X/>}`). `ErrorBoundary` takes a COMPONENT TYPE, and calls
 * it with `FallbackProps`. A merged component would need an optional `error` prop to
 * branch at runtime. React already makes that distinction at the mount point. The merge
 * would also drag the policy table, the recovery ladder, and the report modal into the
 * loading spinner's render path.
 */
const APP_SURFACE = 'flex-center h-full w-full flex-col gap-3 bg-background p-10'

/**
 * This is the same surface, for the form with no box to fill.
 *
 * ⚠ **`h-full` alone collapses silently in map mode. This is the common case.** An
 * unboxed map embed measures zero height on purpose. Everything the interface draws uses
 * `position: fixed`, so the element itself takes no room in the host's layout. The
 * standalone shell's `<html>` behaves the same way. A percentage height against a parent
 * with no definite height resolves to `auto`. So this surface shrink-wraps to its own
 * content instead: measured at 140px, pinned to the TOP of an 800px viewport, with the
 * spinner centred in that 140px, not on the screen.
 *
 * So this fallback copies the shape of what it replaces. The interface it stands in for
 * is fixed and inset-0 in that form, and so is this. Where the widget HAS a box — a
 * contained map, a map-less embed, the compact card — `h-full` is already correct. Taking
 * the viewport there would paint over the host's page. So the caller decides the form.
 * This component does not guess it.
 */
const APP_SURFACE_UNBOXED = `${APP_SURFACE} fixed inset-0`

export type LoadingFallbackProps = {
  /**
   * Take the viewport, not the parent's height. True only for the unboxed map form,
   * whose interface is itself fixed. See `APP_SURFACE_UNBOXED`.
   */
  unboxed?: boolean
}

export function LoadingFallback({ unboxed = false }: LoadingFallbackProps) {
  const { t } = useTranslation('common')

  return (
    <div className={unboxed ? APP_SURFACE_UNBOXED : APP_SURFACE}>
      {/* Use `srLabel`, not `label`. Screen readers announce it, but it does not draw
          on screen. `DrawerLoadingBody` makes the same choice. A visible "Loading…"
          text adds nothing the spinner has not already said. Its height would also
          push the spinner off centre. */}
      <Spinner color="secondary" srLabel={t('loading')} />
    </div>
  )
}

/**
 * This covers every state that leaves a viewer looking at no content. That is the five
 * classified failures, plus the three ways a list can legitimately end up empty.
 *
 * The empty states are NOT errors. Nothing throws to produce them. They share this table
 * because they share the screen. A region whose programs have all ended, and a URL that
 * never existed, leave a viewer in the same position. The only honest difference is the
 * sentence shown. So these states differ by one row, not by one component (issue #89).
 */
export type FallbackKind =
  | ErrorKind
  | 'not-found-event'
  | 'not-found-region'
  | 'empty'
  | 'unavailable'
  | 'share-unavailable'
  | 'country-site'
  | 'no-results'
  | 'no-nearby'

/** The copy, the register, and the actions one state is allowed to render. */
export type FallbackPolicy = {
  /** `common` namespace key for the sentence shown in place of the thrown string. */
  messageKey: string
  /**
   * English text for when that key cannot resolve. Nothing is bundled. Every namespace
   * loads over HTTP. So a failure before the locale JSON arrives would otherwise show
   * the raw key, like "error.offline", to the viewer. A network failure never recovers
   * this way. The JSON travels the same link that just broke.
   */
  fallbackText: string
  /**
   * The visual register, and the announcement style that comes with it. `danger` marks
   * a malfunction. It shows red, and interrupts a screen reader. `neutral` marks a dead
   * end or an empty list — a wrong turn or an empty place. Neither is broken. Red chrome
   * and an interruption would overstate a situation the viewer can simply leave.
   */
  color: 'danger' | 'neutral'
  /** Reset the boundary and re-run the failed query. */
  retry: boolean
  /** Somewhere real to go, chosen by `useRecoveryOffer`. */
  onward: boolean
  /** A geocoder. It lets the viewer name a place the offer's rungs cannot guess. */
  search: boolean
  /** Drop the active filters. Offered only when they are the reason the list is empty. */
  clearFilters: boolean
  /**
   * Put the viewer in touch with a person. Only the registration-blocked row uses this.
   * When a class is full, or registration has closed, only the organiser can still let
   * someone in. No button here can do that. `onward` stands in when nobody is there to
   * call.
   */
  contact: boolean
  /** Open the report modal, carrying the thrown message as context (issue #79). */
  report: boolean
}

/**
 * Four rows leave a viewer somewhere real but empty-handed: three kinds of dead link,
 * and one barren list. They differ ONLY in their sentence. That is the whole reason for
 * one shared table. A URL that never existed, and a region whose programs have all
 * ended, put the viewer in the same position. So they get the same way out: somewhere to
 * go, then a field to name somewhere else. They get none of the actions that cannot
 * help. Retrying a URL that does not exist always fails the same way. Neither case is
 * worth a report.
 */
const DEAD_END = {
  color: 'neutral',
  retry: false,
  onward: true,
  search: true,
  clearFilters: false,
  contact: false,
  report: false,
} as const

/** Shared with the app-level surface. That surface has no view context, so it cannot name an entity. */
const NOT_FOUND_TEXT = "We couldn't find what you were looking for."

/**
 * This is the action table (issue #89). It is kept as data, so no fallback hard-codes a
 * button list. Every surface renders the same policy in its own chrome. Adding a state
 * means adding a row, not a branch.
 *
 * It lives here, not beside `classifyError` in `src/lib/report.ts`, because it is UI
 * policy, not domain logic. `messageKey` is an i18next key, and the flags name specific
 * controls. `src/lib/` stays free of React and i18n. The pure half — which KIND of
 * failure this is — stays in lib, where it is testable alone.
 *
 * `report` is always the lowest-weight action. So the spec's "secondary" needs no axis
 * of its own. On `server`, it sits under a retry that is more likely to help. On
 * `config`, it is the only thing offered, so it is the only thing to look at.
 */
export const ERROR_POLICY: Record<FallbackKind, FallbackPolicy> = {
  // The team cannot act on a connectivity problem. The report POST (#80) needs
  // the same network that just failed. So this row has no report action. Code reaches
  // this row only when the BROWSER itself reports offline. An ambiguous network failure
  // uses `server` instead, which keeps its report action.
  //
  // This row also has no onward link and no geocoder. Both need the network that just
  // failed. Offering them would only produce the same failure one press later.
  offline: {
    messageKey: 'error.offline',
    fallbackText: 'You appear to be offline.',
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: false,
  },
  server: {
    messageKey: 'error.server',
    fallbackText: 'Our servers are having trouble right now.',
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: true,
  },
  // A dead link is a wrong turn, not a malfunction. So it uses the empty
  // state's wording and its way out. `not-found` is the honest generic case. The
  // drawer usually knows more: the URL shows whether the viewer opened an event or
  // a place. `<event>/register` still counts as the event.
  'not-found': { ...DEAD_END, messageKey: 'error.not_found', fallbackText: NOT_FOUND_TEXT },
  'not-found-event': {
    ...DEAD_END,
    messageKey: 'error.not_found_event',
    fallbackText: "We couldn't find that event.",
  },
  'not-found-region': {
    ...DEAD_END,
    messageKey: 'error.not_found_region',
    fallbackText: "We couldn't find that place.",
  },
  // The embed is misconfigured, or SahajCloud's data shape drifted. Both need a
  // human to fix them. No button here fixes either one.
  config: {
    messageKey: 'error.config',
    fallbackText: "This Atlas isn't set up correctly on this page.",
    color: 'danger',
    retry: false,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: true,
  },
  // Turnstile failed to load, so this widget cannot send anything the viewer
  // writes (issue #182). The usual cause is a `config` failure: a host CSP that is
  // missing challenges.cloudflare.com. This row still earns its own row, for one
  // reason `config` cannot express:
  //
  // **It offers no report action.** The report form is itself gated by Turnstile.
  // Sending a viewer to it would hand them a second form that also cannot submit.
  // This mirrors the call `offline` makes for the network, one layer along.
  // `REPORTED_KINDS` mirrors it too.
  //
  // The sentence names the cause, not the fix. A visitor cannot edit a CSP. The
  // instruction "add challenges.cloudflare.com to your script-src" means nothing
  // to most visitors on a meditation page. Only the site's developer needs it.
  // `reportIntegrationWarning` prints that instruction to the console, where a
  // developer debugging the embed will look. `docs/embedding.md` carries the
  // lasting version.
  //
  // ⚠ **This row DOES retry. That looks wrong next to `config`, but is correct.**
  // The probe reports the same verdict for a CSP that blocks the script and for a
  // script request that simply failed on the network. `loadTurnstile` clears its
  // cached promise on failure. So a second attempt is a real second attempt, and
  // the network-failure half of that pair can genuinely recover. A CSP block fails
  // again the same way, which costs the viewer one press. A `config` failure has
  // no such recoverable half, so it withholds the retry. This row does not.
  'captcha-blocked': {
    messageKey: 'error.captcha_blocked',
    fallbackText: "This Atlas can't run on this page: its security check was blocked.",
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: false,
  },
  // The catch-all row. A zod parse failure lands here too. SahajCloud's data shape
  // drifting from ours used to have its own `contract` row, which only withheld the
  // retry. That row named a CAUSE, not a recovery. The cause belongs in the report,
  // which carries the thrown message. It does not belong on a screen where the
  // viewer can do nothing about it.
  unknown: {
    messageKey: 'error.generic',
    fallbackText: 'Something went wrong.',
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: true,
  },
  // This row used to offer no action, on the idea that an empty region is
  // nobody's mistake. That is true, but it still left one sentence and nothing to
  // press. That is the same dead end whether the URL was wrong or just empty.
  empty: { ...DEAD_END, messageKey: 'filters.no_events', fallbackText: 'No events found.' },
  // A class that exists and runs, but cannot be joined: full, ended, or
  // registration closed. Not an error, and not empty. This is the one row whose
  // best next step is a PERSON. It leads with the organiser's number, and falls
  // back to "somewhere else nearby" only when the event has no contact.
  // `visibleActions` enforces this either/or. Offering both would put a weaker
  // option beside the one that can actually get you in.
  //
  // The caller supplies this row's sentence, not the row itself. `useEventDisplay`
  // already owns the status-to-copy table (full / ended / closed / hidden), and
  // `event.test.ts` checks it. The text here shows only if that lookup ever comes
  // back empty.
  unavailable: {
    messageKey: 'error.unavailable',
    fallbackText: 'This program can’t be joined right now.',
    color: 'neutral',
    retry: false,
    onward: true,
    search: false,
    clearFilters: false,
    contact: true,
    report: false,
  },
  // The share screen for a class with no link to give out. It has no
  // canonical page on the main site, and the host page routes the widget off-URL.
  // So the address bar names the host's article, not this meditation (issue #115).
  // Nothing is broken, and nothing is missing from the class. Only the link is
  // missing. So this row uses the neutral register.
  //
  // This row is its own, not `unavailable`'s, which it briefly borrowed. The
  // reason is the one `FallbackValues` states: a state that needs a different
  // sentence gets a different row. This keeps every sentence under the test that
  // pins `fallbackText` to the shipped English copy. `unavailable` also grants
  // `onward`. Here that would answer "you can't share this" with "see events in
  // Cambridgeshire" — sending the viewer away from the class they meant to share.
  //
  // This row grants `contact` alone. That is the one thing that still works
  // without a URL: telling a person about a class, even where a link cannot. With
  // nobody to call, `visibleActions`' promised-but-not-offered rule shows the
  // report action instead. This is accepted, not designed around. A class with
  // neither a public page nor a contact IS a gap worth a report. That beats a
  // sentence with nothing else beside it.
  'share-unavailable': {
    messageKey: 'error.share_unavailable',
    fallbackText: 'There is no link to share for this meditation yet.',
    color: 'neutral',
    retry: false,
    onward: false,
    search: false,
    clearFilters: false,
    contact: true,
    report: false,
  },
  // A searched country that lists no programs at all (issue #82). This is
  // structurally a dead end, like the other rows. The only difference: the caller
  // knows a better next step than the recovery ladder does, and passes it in.
  'country-site': {
    ...DEAD_END,
    messageKey: 'country_site.title',
    fallbackText: 'No classes listed in %{country} yet.',
  },
  // Filters are both the explanation and the way out. So this row keeps "Clear
  // all" and nothing else. An onward link would compete with the one action that
  // actually restores results here.
  'no-results': {
    messageKey: 'filters.no_results',
    fallbackText: 'No events match your filters.',
    color: 'neutral',
    retry: false,
    onward: false,
    search: false,
    clearFilters: true,
    contact: false,
    report: false,
  },
  // This is the only row that offers nothing, and the only one that should.
  // Every match is simply farther away than the boundary, and the list's own
  // "Show distant events" control sits right below it saying so. `visibleActions`
  // leaves this row alone, since it promised nothing for a surface to remove.
  'no-nearby': {
    messageKey: 'filters.no_nearby',
    fallbackText: 'No events within %{km} km.',
    color: 'neutral',
    retry: false,
    onward: false,
    search: false,
    clearFilters: false,
    contact: false,
    report: false,
  },
}

/**
 * Ruby-style `%{name}` interpolation, for a row whose sentence names something the
 * table cannot know: how far "nearby" reached, or which country lists nothing.
 *
 * This holds values only. A caller cannot swap the KEY or its English default. When a
 * state needs a different sentence, it gets a different row instead (`not-found-event`,
 * `not-found-region`). That keeps every sentence under the test that pins
 * `fallbackText` to the shipped English copy. An override would be a second, untested
 * way to vary the copy.
 */
export type FallbackValues = Record<string, string | number>

/**
 * The copy and policy for one state. Split out of `useErrorDisplay` so the empty
 * states, which have nothing to classify, can reach the same table by naming their kind
 * directly.
 *
 * `useSuspense: false`, because this can render before any locale JSON arrives. An
 * embed with no API key throws on the very first render. Suspending HERE would push the
 * tree back to the parent's loading fallback, and show nothing at all. An untranslated
 * label beats a blank widget, when the whole point is to show the failure.
 */
export function useFallbackDisplay(kind: FallbackKind, values?: FallbackValues) {
  const { t } = useTranslation('common', { useSuspense: false })
  // `?? unknown` stops the lookup from returning undefined and breaking the
  // next line. Callers name the kind from a union type. But `classifyError`'s
  // own-property check resolves `hasOwnProperty` at call time, and this widget
  // runs inside host pages that are free to patch `Object.prototype`. This is the
  // one lookup that could break the promise every fallback relies on. A throw
  // HERE escapes the only boundary in the tree, and unmounts the whole widget.
  const policy = ERROR_POLICY[kind] ?? ERROR_POLICY.unknown

  return {
    policy,
    // `defaultValue` makes an unloaded namespace render English, not the raw
    // key. See `fallbackText`.
    message: t(policy.messageKey, { ...values, defaultValue: policy.fallbackText }),
  }
}

/**
 * Everything a fallback needs to render one *thrown* failure: which kind, which
 * buttons, what sentence, and what to attach to a report.
 */
export function useErrorDisplay(error: unknown, values?: FallbackValues) {
  const kind = classifyError(error)
  const { policy, message: text } = useFallbackDisplay(kind, values)

  // The thrown developer string is not the headline. It is untranslated text
  // written for developers, and rendered to a viewer inside someone else's page.
  // It survives only as report context (issue #89).
  return { kind, policy, message: text, reportContext: errorMessage(error) ?? text }
}

/** What survived both the policy and the surface. */
export type VisibleActions = ReturnType<typeof visibleActions>

/** What the surface rendering a policy can and can't support. */
export type SurfaceLimits = {
  /** There is a boundary to reset. */
  canRetry: boolean
  /** There is a filter set to drop. */
  canClearFilters?: boolean
  /**
   * In-widget navigation reaches somewhere else. False on the app-level fallback. There
   * the drawer stack never mounted, so a route change would move the URL and nothing
   * else.
   */
  canNavigate?: boolean
  /** The surface already leads with a geocoder (SearchView). A second would look odd. */
  hasSearchChrome?: boolean
  /** There is an organiser's number on the event, so the viewer can be put in touch
   *  with someone. Without one, `contact` gives way to `onward`. */
  canContact?: boolean
}

/**
 * Which controls survive, once the SURFACE narrows what the policy permits. The
 * surface may remove the boundary to reset, remove all navigation, or already show a
 * geocoder on screen.
 *
 * This function never strands a viewer. If the policy promised a way out, and the
 * surface removed every one, the report action still appears regardless. A screen with no
 * controls at all is worse than a screen with the wrong control. That is exactly what
 * `not-found` would produce at the app level, where its onward offer and its field
 * cannot render.
 *
 * A policy that promises NOTHING is left alone. `no-nearby` is a note about the list
 * right below it. That list's own "Show distant events" control is the way out. Adding
 * a report action there would invite reports of a working feature. This function is
 * pure, so both rules above are testable without a DOM.
 */
export const visibleActions = (
  policy: FallbackPolicy,
  {
    canRetry,
    canClearFilters = false,
    canNavigate = true,
    hasSearchChrome = false,
    canContact = false,
  }: SurfaceLimits,
) => {
  const retry = policy.retry && canRetry
  const contact = policy.contact && canContact
  // `contact` wins over `onward` where a row grants both. For a full class,
  // only the organiser can still let somebody in. "See events nearby" beside that
  // would offer a consolation prize as an equal choice. `onward` is what remains
  // when nobody is there to call.
  const onward = policy.onward && canNavigate && !contact
  const search = policy.search && canNavigate && !hasSearchChrome
  const clearFilters = policy.clearFilters && canClearFilters

  const promised =
    policy.retry || policy.onward || policy.search || policy.clearFilters || policy.contact
  const offered = retry || onward || search || clearFilters || contact

  return {
    retry,
    onward,
    search,
    clearFilters,
    contact,
    report: policy.report || (promised && !offered),
  }
}

/** The onward rung's label. `kind` picks the sentence. The offer carries the name. */
const offerLabel = (t: ReturnType<typeof useTranslation>['t'], offer: RecoveryOffer) => {
  switch (offer.kind) {
    case 'countries':
      return t('error.browse_countries', { defaultValue: 'Browse all countries' })
    case 'city':
      return t('error.near_city', { city: offer.name, defaultValue: 'See events near %{city}' })
    case 'country-site':
      return t('country_site.cta', {
        country: offer.name,
        defaultValue: 'Visit the %{country} website',
      })
    default:
      return t('error.back_to_region', {
        region: offer.name,
        defaultValue: 'See events in %{region}',
      })
  }
}

/**
 * Where `onward` leads: a link INSIDE the sentence's banner, not a button beside it. It
 * is the one control that continues the sentence, rather than acting on it. For
 * example: "we couldn't find that place… see events in Belgium." Read as one thought,
 * it needs the banner's own tint and its own line, not the weight of a filled button
 * competing with a retry that is not there.
 *
 * This is an anchor, never a `<Button href>`. The widget runs under its own router,
 * inside someone else's page. A plain `<a href="/gb">` there would navigate the HOST
 * document away. The `Link` atom routes internally instead. It stamps the depth and
 * camera that the drawer stack's back-navigation depends on.
 */
export function OnwardLink({ offer }: { offer: RecoveryOffer }) {
  const { t } = useTranslation('common', { useSuspense: false })

  return (
    <Link
      className="mt-2 text-sm font-medium"
      color="primary"
      href={offer.path}
      // The country-site rung leaves the widget entirely. So it gets the external
      // treatment: a new tab, the atom's safe `rel`, and the anchor glyph that shows
      // this.
      isExternal={offer.kind === 'country-site'}
      showAnchorIcon={offer.kind === 'country-site'}
    >
      {offer.kind === 'country-site' && (
        <CircleFlag
          className="h-5 w-5 shrink-0 rounded-full border border-divider bg-divider"
          countryCode={offer.countryCode.toLowerCase()}
          // The flag SVG loads from react-circle-flags' own CDN. Without this
          // attribute, the embedding host's URL would ride along to that third
          // party on every render.
          referrerPolicy="no-referrer"
        />
      )}
      {offerLabel(t, offer)}
    </Link>
  )
}

/**
 * The contact action is an anchor wearing a button's skin. `tel:` is a real href a
 * viewer may want to long-press or copy, so it is not faked with an onClick handler.
 * `h-auto min-h-10 whitespace-normal py-2` relaxes the recipe's fixed height and its
 * no-wrap rule. This lets a long international number wrap, instead of overflowing a
 * 375px sheet.
 */
const callSkin = controlSurface({
  color: 'primary',
  variant: 'flat',
  className: 'h-auto min-h-10 whitespace-normal py-2',
})

/** Who to call when a class cannot be joined: the organiser on the event. */
export type FallbackContact = { phone: string; name?: string | null }

export type FallbackActionsProps = {
  /** The result of `visibleActions` — what the policy AND the surface both allow. */
  actions: VisibleActions
  /** The organiser's number, for the `contact` action. */
  contact?: FallbackContact
  /** The thrown message, carried into the report as context (issue #79). */
  reportContext: string
  /** Reset the boundary and re-run the failed query. */
  resetErrorBoundary?: () => void
  /** Drop the active filters. */
  onClearFilters?: () => void
  /** Follows the panel's posture. This stops the buttons floating centred under
   *  left-aligned copy. Defaults to `center`, matching `FallbackPanel`. */
  align?: FallbackAlign
}

/**
 * The controls a state may offer. This function reads them from the policy, not from
 * a hard-coded list (issue #89). So the app-level fallback, the drawer fallback, and
 * the empty lists can differ in chrome, without ever drifting on what a given state
 * allows.
 *
 * These are the ACTIONS: things that operate on the screen you are looking at. They
 * sit outside the banner, so they cannot inherit its tint or read as part of the
 * sentence. One control is not an action: the onward link. It stays inside the banner
 * (`OnwardLink`). The order is by weight: the action most likely to help comes first,
 * and the report action comes last.
 */
export function FallbackActions({
  actions,
  contact,
  reportContext,
  resetErrorBoundary,
  onClearFilters,
  align = 'center',
}: FallbackActionsProps) {
  // `useSuspense: false`, for the same reason `useFallbackDisplay` sets it:
  // this can render before any locale JSON arrives. `defaultValue` on each label,
  // for the same reason again. A raw "error.retry" on a button is worse than an
  // untranslated one.
  const { t } = useTranslation('common', { useSuspense: false })
  const { t: tEvents } = useTranslation('events', { useSuspense: false })
  const openReport = useReportModal((state) => state.openReport)

  // `visibleActions` is the single answer for what shows. It already accounts
  // for whether a filter set exists to drop. Nothing here re-derives that.
  if (!actions.retry && !actions.report && !actions.clearFilters && !(actions.contact && contact))
    return null

  // This is one wrappable row, not a column. These buttons are peers: a way
  // forward, and a way to tell us. Stacking short buttons vertically would read
  // as a list of steps, not a choice.
  return (
    <div
      className={`flex w-full flex-wrap items-center gap-2 ${
        align === 'start' ? 'justify-start' : 'justify-center'
      }`}
    >
      {actions.retry && (
        // `primary` here, while report uses `neutral`. Both sit in the same row. The
        // one more likely to help must carry more weight than the one of last
        // resort.
        <Button color="primary" variant="flat" onClick={resetErrorBoundary}>
          {t('error.retry', { defaultValue: 'Try again' })}
        </Button>
      )}
      {actions.contact && contact && (
        // The NUMBER is the label, not "Contact". On touch, it dials. On desktop, a
        // bare `tel:` link is a dead end. So a desktop viewer needs the number on
        // screen, to read and copy, rather than hidden behind the press. (The event
        // panel solves the same problem with a popover, which needs a circle to hang
        // off. This row has buttons instead.) The accessible name states what the
        // control does.
        <Link
          aria-label={
            contact.name
              ? `${tEvents('actions.contact', { defaultValue: 'Contact' })} — ${contact.name}`
              : tEvents('actions.contact', { defaultValue: 'Contact' })
          }
          className={callSkin}
          color="neutral"
          // The code strips whitespace from the URI, but keeps it in the label. RFC
          // 3966 allows no spaces in a `tel:` URI, and some dialers fail on them. But
          // a human reads "+44 20 1234 5678" back more easily.
          href={`tel:${contact.phone.replace(/\s+/g, '')}`}
        >
          <PhoneOutgoing size={18} />
          {contact.phone}
        </Link>
      )}
      {actions.clearFilters && (
        <Button color="primary" variant="flat" onClick={onClearFilters}>
          {t('filters.clear', { defaultValue: 'Clear all' })}
        </Button>
      )}
      {/* A way to tell us, when the fault is ours rather than the link's. It
          carries the thrown message as report context (issue #79). Suppressed for
          `offline`: connectivity is not ours to fix, and the report POST (#80) needs
          the same network that just failed. This suppresses only while something
          else is on offer. */}
      {actions.report && (
        // `flat`, not `ghost`. In the same row as another button, a ghost variant
        // would read as disabled next to a filled one. `neutral` keeps its lower
        // weight instead.
        <Button color="neutral" variant="flat" onClick={() => openReport(reportContext)}>
          {t('report.title', { defaultValue: 'Report an issue' })}
        </Button>
      )}
    </div>
  )
}

/**
 * The wrapper every fallback surface renders into. It is a focusable region, named by
 * its own message.
 *
 * It takes focus on mount. This keeps a keyboard user inside the widget. When a
 * boundary trips mid-session, focus was on the card or link just activated. That
 * element has now unmounted, so focus falls to `<body>`. Without this, the next Tab
 * would start at the top of the HOST page. Focusing here also announces the message. A
 * live region does not announce reliably here, because these fallbacks mount already
 * holding their text, and a live region only announces content that changes *after* it
 * exists.
 *
 * This steals focus only from `<body>`, or from nothing. A background refetch can
 * throw while the viewer is typing in the host page's own form. Moving their caret
 * then would be far worse than a missed announcement. This costs nothing for the case
 * this exists for, where an unmounted card leaves focus at `<body>` anyway.
 */
export function FallbackRegion({
  message,
  className,
  children,
}: {
  message: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    const active = node?.ownerDocument.activeElement

    // `preventScroll` stops the browser scrolling every scrollable ancestor,
    // including the HOST document, to bring the widget into view. Without it, a
    // boot failure on a page where the widget sits below the fold would yank the
    // visitor's page down to it, uninvited.
    if (node && (!active || active === node.ownerDocument.body)) node.focus({ preventScroll: true })
  }, [])

  // `role="group"`: without this role, browsers ignore `aria-label` on the
  // generic role. So the name set here would never announce when focus lands.
  //
  // `outline-none`: the focus above is a screen-reader affordance, not an
  // interactive one. Without this, the focus ring drew a box around the whole
  // panel the moment it mounted, which reads as a selected element rather than
  // an announcement. Suppressing it is safe: `tabIndex={-1}` makes this
  // unreachable by Tab, so no keyboard user can land here and lose an
  // indicator.
  return (
    <div
      ref={ref}
      aria-label={message}
      className={`outline-none ${className ?? ''}`}
      role="group"
      tabIndex={-1}
    >
      {children}
    </div>
  )
}

/**
 * Centres a short fallback body, but only within the space the viewer can actually
 * see.
 *
 * `DrawerBody` fills a bottom sheet set to `h-dvh` (vaul computes its snap translates
 * from the window height). The mobile snap view shows only its top 300px. So a plain
 * `justify-center` would place content at roughly `1.5 × viewport − 300` from the top —
 * measured at 643px in a 667px viewport, off screen. That is why these states were
 * invisible on every phone.
 *
 * Two parts do the work here, and both matter:
 *
 *  - `max-h` reads `--sy-sheet-top`, the sheet's live top edge. DrawerStack mirrors
 *    this value every frame, so the box cannot extend far past the fold. The `0px`
 *    fallback resolves to the full height. That is correct on the desktop panel and
 *    the map-less container, where the body already IS the visible area. It still
 *    over-measures by the header's height — the box starts below the header, not at
 *    the sheet's edge — which is why the second part matters.
 *  - **Auto margins, not `justify-center`.** Auto margins centre content when there is
 *    slack, and collapse to nothing when there is not. So tall content starts at the
 *    top and scrolls inside the body instead. `justify-center` would instead clip the
 *    overflowing TOP, hiding the sentence and leaving only the buttons. That is the
 *    failure mode this fix avoids.
 */
export const CENTERED_BODY =
  'flex h-full max-h-[calc(var(--sy-frame-h)_-_var(--sy-sheet-top,0px))] flex-col items-center p-6 text-center [&>:first-child]:mt-auto [&>:last-child]:mb-auto'

/**
 * The other posture: top-left, with no centring at all.
 *
 * Used for the **list views** (Countries, Region, Online, Search). There, the fallback
 * replaces a list — content that starts at the top-left of the body. Centring it would
 * move the sentence away from where the reader's eye already is, and would make the
 * drawer look like a different kind of screen. This posture also needs no `max-h`
 * guard: content that starts at the top is on screen by construction. That is exactly
 * what `CENTERED_BODY` has to work to achieve.
 */
export const START_BODY = 'flex h-full flex-col items-start p-6 text-start'

/** Which posture a surface renders in — see `CENTERED_BODY` / `START_BODY`. */
export type FallbackAlign = 'center' | 'start'

/** The rung that needs no data at all, and so can always be offered. */
const COUNTRIES_OFFER: RecoveryOffer = { kind: 'countries', path: '/' }

type FallbackShellProps = FallbackActionsProps & {
  policy: FallbackPolicy
  message: string
  /** Where onward leads, resolved by `useRecoveryOffer` or supplied by the caller. */
  offer?: RecoveryOffer
  /** The geocoder, when the actions allow one. */
  children?: ReactNode
}

/**
 * The presentation layer, with nothing that can fail: the sentence in its register
 * (carrying the onward link), the action row beneath it, and a field when offered. The
 * live body and the floor it degrades to both render this, so the two cannot look like
 * different screens.
 *
 * ONE column at ONE width. Every part is `w-full` inside a single `max-w-xs` box. Left
 * to shrink-wrap on its own, each part came out a different width, stacked on a centre
 * line: a banner as wide as its sentence, a button row as wide as its labels, and a
 * full-width field.
 */
function FallbackShell({
  policy,
  message,
  offer,
  align = 'center',
  children,
  ...actionProps
}: FallbackShellProps) {
  return (
    <FallbackRegion className={align === 'start' ? START_BODY : CENTERED_BODY} message={message}>
      <div className="flex w-full max-w-xs flex-col items-start gap-3">
        {/* `textAlign="left"` is set explicitly, not left to the default. The
            centred posture sets `text-center` on the container. A sentence centred
            inside its own banner is harder to read, and costs the onward link its
            left edge. */}
        <Alert
          align="start"
          className="w-full"
          color={policy.color}
          description={message}
          role={policy.color === 'danger' ? 'alert' : 'status'}
          textAlign="left"
        >
          {actionProps.actions.onward && offer && <OnwardLink offer={offer} />}
        </Alert>
        <FallbackActions {...actionProps} align={align} />
        {/* `text-start` for the same reason, and here it is functional. A centred
            placeholder in an input reads as a broken field. The field carries its
            own prompt ("Or search for a place"), so it needs no label line above
            it. */}
        {actionProps.actions.search && children && (
          <div className="w-full text-start">{children}</div>
        )}
      </div>
    </FallbackRegion>
  )
}

/** Layer 2: the only part that reads data. Split out so a throw here costs only the
 *  offer and the field, never the sentence or the frame around it. This also means the
 *  ladder runs only where its answer can render (see `FallbackPanel`). */
function FallbackBody(props: FallbackShellProps) {
  const laddered = useRecoveryOffer()

  return <FallbackShell {...props} offer={props.offer ?? laddered} />
}

export type FallbackPanelProps = {
  /** Which row of `ERROR_POLICY` governs the copy, the register and the controls. */
  kind: FallbackKind
  /** Interpolation for the row's sentence — see `FallbackValues`. */
  values?: FallbackValues
  /**
   * The sentence itself, when another owner holds its copy. Only one row uses this:
   * `unavailable`. Its four reasons (full / ended / closed / hidden) are already
   * resolved and tested by `useEventDisplay`'s status table. Copying them into
   * `ERROR_POLICY` would recreate the hand-agreement this whole table exists to
   * remove. So this row keeps a generic sentence, and the caller supplies the specific
   * one. This is not a general escape hatch. Everything else the TABLE defines still
   * gets its copy from the table, where the English-parity test can see it.
   */
  message?: string
  /** The organiser to put a viewer in touch with, for the `contact` action. */
  contact?: FallbackContact
  /** The thrown message, for the report CTA. Absent for an empty list: nothing threw. */
  reportContext?: string
  /**
   * Where `onward` leads, when the caller knows better than the recovery ladder. This
   * is the country-site rung, decided from the searched country rather than the URL's
   * ancestry. When omitted, the ladder chooses instead.
   */
  offer?: RecoveryOffer
  resetErrorBoundary?: () => void
  onClearFilters?: () => void
  /**
   * Where the panel sits in its body. `center` (the default) suits a drawer whose
   * whole content this replaces. `start` suits the LIST views, where the fallback
   * stands in for content that begins at the top-left. Centring it there would move
   * the sentence away from where the reader is already looking.
   */
  align?: FallbackAlign
  /** The surface already leads with a geocoder, so this must not draw a second one. */
  hasSearchChrome?: boolean
  /**
   * The geocoder for the `search` action, passed in rather than imported. It wraps a
   * Mapbox custom element that lives in the organisms layer, and this component also
   * renders from organisms. A caller that cannot supply one simply omits it.
   */
  children?: ReactNode
}

/**
 * The one body every state with no content renders: a dead link, a broken query, an
 * empty list (issue #89). What it says, and what it offers, come entirely from
 * `ERROR_POLICY`. Three components used to agree on this by hand. Now one component
 * reads one table instead.
 *
 * This is built in layers, because THE FALLBACK MUST NEVER THROW. It runs where a
 * throw would escape to the app-level boundary, and blank the whole widget inside
 * someone else's page:
 *
 *   1 — copy and policy (`useFallbackDisplay`, `visibleActions`): pure, and defaults
 *       to the `unknown` row, instead of looking up a missing one.
 *   2 — the offer (`useRecoveryOffer`) and the geocoder: three cache reads and a
 *       custom element. These sit behind their OWN boundary, and degrade to the floor
 *       rung — "Browse all countries", which needs no data at all — reporting why
 *       through `reportInternalError`.
 *
 * The floor keeps layer 1's retry and report actions. Only the parts that actually
 * failed are dropped. This also never defaults to `null`. Unlike the report modal,
 * which stays off screen until asked, this IS the screen. So falling back to nothing
 * would strand the viewer.
 */
export function FallbackPanel({
  kind,
  values,
  message,
  reportContext,
  offer,
  contact,
  resetErrorBoundary,
  onClearFilters,
  align,
  hasSearchChrome,
  children,
}: FallbackPanelProps) {
  const { policy, message: rowText } = useFallbackDisplay(kind, values)
  const actions = visibleActions(policy, {
    canRetry: !!resetErrorBoundary,
    canClearFilters: !!onClearFilters,
    canContact: !!contact,
    hasSearchChrome,
  })
  const text = message ?? rowText

  const shared = {
    policy,
    message: text,
    contact,
    reportContext: reportContext ?? text,
    resetErrorBoundary,
    onClearFilters,
    align,
    actions,
    offer,
  }

  // Only the rows that can SHOW a rung pay the cost of resolving one. Six of
  // the eleven policy rows set `onward: false`, and `country-site` brings its
  // own rung. Three of those rows — the two empty-list rows and the country
  // offer — render during normal operation, not just on failure. There, the
  // ladder's cache reads and region scan would be pure waste. Hook order is
  // per-component, so the branch must sit between two components, not inside
  // one. `FallbackShell` is the same component the degraded path below renders.
  if (!actions.onward || offer) return <FallbackShell {...shared}>{children}</FallbackShell>

  return (
    <ErrorBoundary
      fallbackRender={() => (
        // The floor keeps layer 1's retry and report actions. It drops only what
        // the ladder and the geocoder contribute. It covers a DATA failure — a
        // rejected cache read, or an unexpected region shape — which is what
        // layer 2 can realistically throw. It does not cover a missing Router.
        // This rung's own link is an internal `Link`, so it would call
        // `useLocation` and throw the same way. Every call site sits under a
        // Router, Ladle included. The alternative, a plain `<a href="/">`, would
        // reload the standalone build and navigate the HOST page away from an
        // embed. That is worse than the case this guards against.
        <FallbackShell
          {...shared}
          actions={{ ...actions, search: false }}
          offer={COUNTRIES_OFFER}
        />
      )}
      onError={(cause) => reportInternalError(cause, 'FallbackPanel')}
    >
      <FallbackBody {...shared}>{children}</FallbackBody>
    </ErrorBoundary>
  )
}

export type ResetErrorBoundaryProps = ErrorBoundaryProps & {
  /**
   * What to call this boundary in a report. It rides along as the `atlas.context`
   * tag, so a Sentry issue names which surface failed, without anyone reading a
   * component stack. The default suits the five in-drawer boundaries, which are all
   * one kind of thing. The app-level boundary (`App.tsx`) names itself instead. "The
   * widget failed to boot" and "a drawer failed to load" are not the same alert.
   */
  context?: string
}

/**
 * An `ErrorBoundary` whose reset actually re-runs the failed query.
 *
 * `resetErrorBoundary` alone re-renders the subtree onto a query still stuck in its
 * error state. That query throws again immediately, so "Try again" visibly does
 * nothing. Pairing every boundary with `QueryErrorResetBoundary`'s `reset` fixes that.
 * Wiring it here means a new boundary cannot be added without it (issue #89).
 *
 * This deliberately does NOT bundle a `Suspense`. The five call sites nest one
 * differently: outside the boundary, inside it, or not at all. Normalizing that would
 * move loading states nobody asked to move.
 *
 * **This is also where an ordinary boundary trip becomes telemetry** (issue #108).
 * Reporting lives here for the same reason `reset` does. Every boundary in the app
 * goes through this component, so one wiring covers all of them. A boundary added
 * later cannot forget to report here. Six hand-written `onError` props would instead
 * drift the moment one call site got copied without it. Before this component
 * existed, the seam had five callers. Every one of them was a failure the code had
 * already caught and worked around by hand: a refused href, an unclaimable fragment, a
 * recovery ladder that could not resolve a rung, the fallback-of-the-fallback. Not one
 * was an ordinary boundary trip. So the failures a viewer actually sees produced no
 * signal at all.
 */
export function ResetErrorBoundary({
  children,
  context = 'view boundary',
  onError,
  onReset,
  ...props
}: ResetErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          {...props}
          // COMPOSED, for the same reason as `onReset` below. A caller may also
          // want to know about the error. Swallowing that silently is the bug this
          // component exists to prevent. The seam decides everything else: whether
          // the failure's kind is worth an event, and what data may travel with
          // it.
          onError={(error, info) => {
            reportInternalError(error, context)
            onError?.(error, info)
          }}
          // COMPOSED, not overridden. A caller's own `onReset` has its own work to
          // do (EventView mints a fresh `lazy`, since React caches a rejected one
          // forever). Assigning `reset` over the spread would swallow that
          // silently. That is the exact dead-retry bug this component exists to
          // prevent.
          onReset={(details) => {
            reset()
            onReset?.(details)
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}

export type ErrorFallbackProps = {
  /** Whatever was thrown — `unknown`, since a rejection need not be an Error. */
  error: unknown
  /** Supplied by the ErrorBoundary. Wired through `ResetErrorBoundary`, so a retry
   *  re-runs the failed query, instead of re-throwing its cached error. */
  resetErrorBoundary?: () => void
}

/**
 * The app-level error-boundary fallback: the whole-widget screen, shown when the app
 * fails to boot at all. It must never throw itself. So the thrown value passes through
 * `useErrorDisplay`, rather than being read directly. The drawer's `FallbackPanel`
 * shares that hook and this action row. So one failure says and offers the same thing,
 * wherever it surfaces.
 *
 * `canNavigate: false` is an honest surface limit here, not a style choice. The drawer
 * stack never mounted, so an onward link would change the URL and leave this same
 * screen on top of it. `visibleActions` restores the report action in its place
 * instead.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const { policy, message, reportContext } = useErrorDisplay(error)
  const actions = visibleActions(policy, {
    canRetry: !!resetErrorBoundary,
    canNavigate: false,
  })

  return (
    <FallbackRegion className={APP_SURFACE} message={message}>
      {/* Same one-column, one-width rule as the drawer body's shell. Same
          left-aligned banner inside a centred panel too. */}
      <div className="flex w-full max-w-xs flex-col items-start gap-3">
        <Alert
          className="w-full"
          color={policy.color}
          description={message}
          role={policy.color === 'danger' ? 'alert' : 'status'}
          textAlign="left"
        />
        {/* The modal host mounts outside this boundary (App.tsx). So the report
            action still works while this fallback is on screen. */}
        <FallbackActions
          actions={actions}
          reportContext={reportContext}
          resetErrorBoundary={resetErrorBoundary}
        />
      </div>
    </FallbackRegion>
  )
}
