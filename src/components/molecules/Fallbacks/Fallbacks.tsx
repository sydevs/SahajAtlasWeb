import type { ErrorBoundaryProps } from 'react-error-boundary'
import type { ReactNode } from 'react'
import type { ErrorKind } from '@/lib/report'
import type { RecoveryOffer } from '@/hooks/use-recovery-offer'

import { useEffect, useRef } from 'react'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { QueryErrorResetBoundary } from '@tanstack/react-query'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { useReportModal } from '@/config/store'
import { useRecoveryOffer } from '@/hooks/use-recovery-offer'
import { classifyError, errorMessage, reportInternalError } from '@/lib/report'

/**
 * The whole-widget surface: what fills the embed when there is no app to show yet, or no
 * app left to show. Shared by both app-level fallbacks so a boot that stalls and a boot
 * that fails occupy exactly the same box — for a viewer they are the same moment, one
 * frame apart.
 *
 * They stay two components rather than one, because the two boundaries that mount them
 * take different things: `Suspense` takes an ELEMENT (`fallback={<X/>}`), `ErrorBoundary`
 * a COMPONENT TYPE it calls with `FallbackProps`. Merging them would mean one component
 * with an optional `error` branching at runtime on a distinction React already makes at
 * the mount point — and the loading half would drag in the policy table, the recovery
 * ladder and the report modal to render a spinner.
 */
const APP_SURFACE = 'flex-center h-full w-full flex-col gap-3 bg-background p-10'

export function LoadingFallback() {
  const { t } = useTranslation('common')

  return (
    <div className={APP_SURFACE}>
      <Spinner color="secondary" label={t('loading')} />
    </div>
  )
}

/**
 * Every state that leaves a viewer looking at no content — the five classified failures
 * plus the three ways a list can legitimately come back empty.
 *
 * The empty ones are NOT errors and nothing throws to produce them; they share this table
 * because they share the screen. A region whose programs have all ended and a URL that
 * never existed leave a viewer in exactly the same position, and the only honest difference
 * is the sentence — so they are one row-shape apart rather than one component apart
 * (issue #89).
 */
export type FallbackKind =
  | ErrorKind
  | 'not-found-event'
  | 'not-found-region'
  | 'empty'
  | 'country-site'
  | 'no-results'
  | 'no-nearby'

/** The copy, the register, and the actions one state is allowed to render. */
export type FallbackPolicy = {
  /** `common` namespace key for the sentence shown in place of the thrown string. */
  messageKey: string
  /**
   * English text for when that key can't be resolved. Nothing is bundled — every
   * namespace is fetched over HTTP — so a failure that happens BEFORE the locale JSON
   * lands would otherwise render the raw key ("error.offline") at the viewer. For a
   * network failure it never recovers, since the JSON travels the link that just broke.
   */
  fallbackText: string
  /**
   * The visual register, and with it the announcement. `danger` is a malfunction —
   * red, and assertive enough to interrupt a screen reader. `neutral` is a dead end or an
   * empty list: a wrong turn or a barren place, neither of which is broken, so red chrome
   * and an interruption would overstate a situation the viewer can simply walk out of.
   */
  color: 'danger' | 'neutral'
  /** Reset the boundary and re-run the failed query. */
  retry: boolean
  /** Somewhere real to go, chosen by `useRecoveryOffer`. */
  onward: boolean
  /** A geocoder, so the viewer can name a place none of the offer's rungs would guess. */
  search: boolean
  /** Drop the active filters — offered only where they are why the list is empty. */
  clearFilters: boolean
  /** Open the report modal, carrying the thrown message as context (issue #79). */
  report: boolean
}

/**
 * The four rows that leave a viewer somewhere real but empty-handed — three flavours of
 * dead link and a barren list — differ ONLY in their sentence. That is the whole argument
 * for one table: a URL that never existed and a region whose programs have all ended put
 * the viewer in exactly the same position, so they get exactly the same way out (somewhere
 * to go, then a field to name somewhere else) and none of the three that can't help.
 * Retrying a URL that doesn't exist fails identically every time, and neither case is
 * something to report.
 */
const DEAD_END = {
  color: 'neutral',
  retry: false,
  onward: true,
  search: true,
  clearFilters: false,
  report: false,
} as const

/** Shared with the app-level surface, which has no view context to name an entity from. */
const NOT_FOUND_TEXT = "We couldn't find what you were looking for."

/**
 * The action table (issue #89). Kept as data so no fallback hard-codes a button list —
 * every surface renders the same policy in its own chrome, and adding a state means adding
 * a row rather than a branch.
 *
 * It lives here rather than beside `classifyError` in `src/lib/report.ts` because it is
 * UI policy, not domain logic: `messageKey` is an i18next key and the flags name specific
 * controls, and `src/lib/` is declared React-free and i18n-free. The pure half — what KIND
 * of failure this is — stays in lib, where it's testable in isolation.
 *
 * `report` is always the lowest-weight CTA, so the spec's "secondary" needs no axis of its
 * own: on `server` it sits under a retry that's likelier to help; on `config` it's the
 * only thing offered, and so the only thing to look at.
 */
export const ERROR_POLICY: Record<FallbackKind, FallbackPolicy> = {
  // Connectivity is not something the team can act on, and the report POST (#80) needs
  // the very network that just failed — so no report CTA. Only reached when the BROWSER
  // agrees we're offline; an ambiguous network failure is `server`, which keeps it.
  //
  // No onward link and no geocoder either: both need the network that just went away, so
  // offering them would only produce the same failure one press later.
  offline: {
    messageKey: 'error.offline',
    fallbackText: 'You appear to be offline.',
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
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
    report: true,
  },
  // A dead link is a wrong turn, not a malfunction — so it takes the empty state's
  // vocabulary and the empty state's way out. `not-found` is the honest generic, but the
  // drawer usually knows better: the URL says whether the viewer was opening an event or
  // a place, and `<event>/register` is still about the event.
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
  // The embed is misconfigured, or SahajCloud's shape drifted. Both need a human;
  // neither is fixed by pressing anything.
  config: {
    messageKey: 'error.config',
    fallbackText: "This Atlas isn't set up correctly on this page.",
    color: 'danger',
    retry: false,
    onward: false,
    search: false,
    clearFilters: false,
    report: true,
  },
  // The catch-all, and where a zod parse failure lands: SahajCloud's shape drifting from
  // ours used to be its own `contract` row, differing only in withholding the retry. It
  // named a CAUSE rather than a recovery — and the cause belongs in the report, which
  // carries the thrown message, not on a screen where the viewer can do nothing with it.
  unknown: {
    messageKey: 'error.generic',
    fallbackText: 'Something went wrong.',
    color: 'danger',
    retry: true,
    onward: false,
    search: false,
    clearFilters: false,
    report: true,
  },
  // It used to be action-less, on the grounds that an empty region is nobody's mistake.
  // True — but it still left one sentence and nothing to press, which is the same dead end
  // whether the URL was wrong or merely barren.
  empty: { ...DEAD_END, messageKey: 'filters.no_events', fallbackText: 'No events found.' },
  // A searched country that lists no programs at all (issue #82). Structurally a dead end
  // like the rest — the difference is only that the caller knows a better rung than the
  // ladder does, and passes it in.
  'country-site': {
    ...DEAD_END,
    messageKey: 'country_site.title',
    fallbackText: 'No classes listed in %{country} yet.',
  },
  // Filters are both the explanation AND the escape, so this keeps "Clear all" and nothing
  // else — an onward link would compete with the one action that restores results here.
  'no-results': {
    messageKey: 'filters.no_results',
    fallbackText: 'No events match your filters.',
    color: 'neutral',
    retry: false,
    onward: false,
    search: false,
    clearFilters: true,
    report: false,
  },
  // The only row that offers nothing, and the only one entitled to: every match is simply
  // farther away than the boundary, and the list's own "Show distant events" control sits
  // directly below saying so. `visibleActions` leaves it alone because it promised nothing
  // for a surface to take away.
  'no-nearby': {
    messageKey: 'filters.no_nearby',
    fallbackText: 'No events within %{km} km.',
    color: 'neutral',
    retry: false,
    onward: false,
    search: false,
    clearFilters: false,
    report: false,
  },
}

/**
 * A sentence the policy's own `messageKey` can't produce. The drawer knows things the kind
 * doesn't — whether a dead link was an event or a place, how far "nearby" reached — so a
 * caller may override the key, its English default, or supply interpolation values.
 */
export type FallbackMessage = {
  key?: string
  text?: string
  /** Ruby-style `%{name}` interpolation (see `.claude/rules/i18n-and-state.md`). */
  values?: Record<string, string | number>
}

/**
 * The copy + policy for one state. Split out of `useErrorDisplay` so the empty states —
 * which have nothing to classify — reach the same table by naming their kind directly.
 *
 * `useSuspense: false` because this can render before any locale JSON has arrived (an
 * embed with no API key throws on the very first render). Suspending HERE would push the
 * tree back to the parent's loading fallback and show nothing at all; an untranslated
 * label beats a blank widget when the whole point is to surface the failure.
 */
export function useFallbackDisplay(kind: FallbackKind, message?: FallbackMessage) {
  const { t } = useTranslation('common', { useSuspense: false })
  // `?? unknown` so the lookup can't come back undefined and take the next line down with
  // it. Callers name the kind from a union, but `classifyError`'s own-property check
  // resolves `hasOwnProperty` at call time — and we run inside host pages that are free to
  // patch Object.prototype. This is the one dereference that could break the promise every
  // fallback is built on: throwing from HERE escapes the only boundary in the tree and
  // unmounts the whole widget.
  const policy = ERROR_POLICY[kind] ?? ERROR_POLICY.unknown

  return {
    policy,
    // `defaultValue` so an unloaded namespace renders English rather than the raw key;
    // see `fallbackText`.
    message: t(message?.key ?? policy.messageKey, {
      ...message?.values,
      defaultValue: message?.text ?? policy.fallbackText,
    }),
  }
}

/**
 * Everything a fallback needs to render one *thrown* failure: which kind, which buttons,
 * what sentence, and what to attach to a report. Every error surface calls this, so the
 * rule "show localized copy, report the thrown string" is stated once and can't drift.
 */
export function useErrorDisplay(error: unknown, message?: FallbackMessage) {
  const kind = classifyError(error)
  const { policy, message: text } = useFallbackDisplay(kind, message)

  // The thrown developer string is not the headline — it's untranslated text written for
  // us, rendered to a viewer inside someone else's page. It survives as report context
  // only (issue #89).
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
   * In-widget navigation reaches somewhere. False on the app-level fallback: the drawer
   * stack never mounted, so a route change would move the URL and nothing else.
   */
  canNavigate?: boolean
  /** The surface already leads with a geocoder (SearchView), so a second would be odd. */
  hasSearchChrome?: boolean
}

/**
 * Which controls survive once the SURFACE has narrowed what the policy permits — there may
 * be no boundary to reset, nowhere to navigate, or a geocoder already on screen.
 *
 * Never strands a viewer: if the policy promised a way out and the surface removed all of
 * them, the report CTA comes back regardless. A screen with no controls at all is the one
 * outcome worse than the wrong control — and it is exactly what `not-found` would produce
 * at the app level, where its onward offer and field can't be rendered.
 *
 * A policy that promised NOTHING is left alone: `no-nearby` is a note about the list
 * directly below it, whose own "Show distant events" control is the way out, and bolting a
 * report CTA onto it would invite reports of a working feature. Pure, so both halves of
 * that invariant are testable without a DOM.
 */
export const visibleActions = (
  policy: FallbackPolicy,
  { canRetry, canClearFilters = true, canNavigate = true, hasSearchChrome = false }: SurfaceLimits,
) => {
  const retry = policy.retry && canRetry
  const onward = policy.onward && canNavigate
  const search = policy.search && canNavigate && !hasSearchChrome
  const clearFilters = policy.clearFilters && canClearFilters

  const promised = policy.retry || policy.onward || policy.search || policy.clearFilters
  const offered = retry || onward || search || clearFilters

  return { retry, onward, search, clearFilters, report: policy.report || (promised && !offered) }
}

/** The onward rung's label. `kind` picks the sentence; the offer carries the name. */
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
 * Where onward leads, as a link INSIDE the sentence's banner rather than a button beside
 * it. It is the one control that continues the sentence rather than acting on it — "we
 * couldn't find that place… see events in Belgium" — and read as one thought it needs the
 * banner's own tint and its own line, not the weight of a filled button competing with a
 * retry that isn't there.
 *
 * An anchor, never a `<Button href>`: the widget runs under HashRouter inside someone
 * else's page, where a plain `<a href="/gb">` would navigate the HOST document away. The
 * `Link` atom routes internally and stamps the depth + camera the drawer stack's
 * back-navigation depends on.
 */
export function OnwardLink({ offer }: { offer: RecoveryOffer }) {
  const { t } = useTranslation('common', { useSuspense: false })

  return (
    <Link
      className="mt-2 text-sm font-medium"
      color="primary"
      href={offer.path}
      // The country-site rung leaves the widget entirely, so it takes the external
      // treatment: a new tab, the atom's safe `rel`, and the anchor glyph that says so.
      isExternal={offer.kind === 'country-site'}
      showAnchorIcon={offer.kind === 'country-site'}
    >
      {offer.kind === 'country-site' && (
        <CircleFlag
          className="h-5 w-5 shrink-0 rounded-full border border-divider bg-divider"
          countryCode={offer.countryCode.toLowerCase()}
          // The flag SVG loads from react-circle-flags' own CDN, so without this the
          // embedding host's URL rides along to a third party on every render.
          referrerPolicy="no-referrer"
        />
      )}
      {offerLabel(t, offer)}
    </Link>
  )
}

export type FallbackActionsProps = {
  /** The result of `visibleActions` — what the policy AND the surface both allow. */
  actions: VisibleActions
  /** The thrown message, carried into the report as context (issue #79). */
  reportContext: string
  /** Reset the boundary and re-run the failed query. */
  resetErrorBoundary?: () => void
  /** Drop the active filters. */
  onClearFilters?: () => void
  /** Follows the panel's posture, so the buttons never float centred under left-aligned
   *  copy. Defaults to `center`, matching `FallbackPanel`. */
  align?: FallbackAlign
}

/**
 * The controls a state is allowed to offer, rendered from the policy rather than a
 * hard-coded list (issue #89) — so the app-level fallback, the drawer fallback and the
 * empty lists can differ in chrome without ever drifting on what a given state lets you do.
 *
 * These are the ACTIONS — things that operate on the screen you're looking at — so they sit
 * outside the banner, where they can't inherit its tint or be read as part of the sentence.
 * The one control that isn't an action, the onward link, stays inside it (`OnwardLink`).
 * Order is weight order: the action likeliest to help first, the report CTA last.
 */
export function FallbackActions({
  actions,
  reportContext,
  resetErrorBoundary,
  onClearFilters,
  align = 'center',
}: FallbackActionsProps) {
  // `useSuspense: false` for the same reason `useFallbackDisplay` sets it: this can render
  // before any locale JSON has arrived. `defaultValue` on each label for the same reason
  // again — a raw "error.retry" on a button is worse than an untranslated one.
  const { t } = useTranslation('common', { useSuspense: false })
  const openReport = useReportModal((state) => state.openReport)

  if (!actions.retry && !actions.report && !(actions.clearFilters && onClearFilters)) return null

  // One wrappable row, not a column: these are peers — a way forward and a way to tell us —
  // and stacking short buttons vertically read as a list of steps rather than a choice.
  return (
    <div
      className={`flex w-full flex-wrap items-center gap-2 ${
        align === 'start' ? 'justify-start' : 'justify-center'
      }`}
    >
      {actions.retry && (
        // `primary`, where report is `neutral`: they sit in the same row, so the one
        // likelier to help has to carry more weight than the one of last resort.
        <Button color="primary" variant="flat" onClick={resetErrorBoundary}>
          {t('error.retry', { defaultValue: 'Try again' })}
        </Button>
      )}
      {actions.clearFilters && onClearFilters && (
        <Button color="primary" variant="flat" onClick={onClearFilters}>
          {t('filters.clear', { defaultValue: 'Clear all' })}
        </Button>
      )}
      {/* If it's us rather than the link, a way to tell us so, carrying the thrown message
          as report context (issue #79). Suppressed for `offline`: connectivity isn't ours
          to fix, and the report POST (#80) needs the same network that just failed — but
          only while something else is on offer. */}
      {actions.report && (
        // `flat`, not `ghost`: sitting in the same row as another button, a ghost read as
        // disabled next to a filled one. It keeps the lower weight through `neutral`.
        <Button color="neutral" variant="flat" onClick={() => openReport(reportContext)}>
          {t('report.title', { defaultValue: 'Report an issue' })}
        </Button>
      )}
    </div>
  )
}

/**
 * The wrapper every fallback surface renders into: a focusable region named by its own
 * message.
 *
 * It takes focus on mount, which is what keeps a keyboard user inside the widget. When a
 * boundary trips mid-session, focus was on the card or link just activated and that
 * element has now unmounted — focus falls to `<body>`, so the next Tab starts at the top
 * of the HOST page. Focusing here also gets the message announced, which a live region
 * does not do reliably: these fallbacks mount already containing their text, and a live
 * region only announces content that changes *after* it exists.
 *
 * It steals focus from `<body>` (or nothing) and nowhere else. A background refetch can
 * throw while the viewer is typing in the host page's own form, and moving their caret
 * would be far worse than a missed announcement — while costing nothing in the case this
 * exists for, where an unmounted card leaves focus exactly there.
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

    // `preventScroll`: without it the browser scrolls every scrollable ancestor — including
    // the HOST document — to bring the widget into view, so a boot failure on a page where
    // the widget sits below the fold would yank the visitor's page down to it unbidden.
    if (node && (!active || active === node.ownerDocument.body)) node.focus({ preventScroll: true })
  }, [])

  // `role="group"`: `aria-label` is ignored on the generic role, so without one the name
  // this sets would never be announced when focus lands here.
  //
  // `outline-none` because the focus above is a screen-reader affordance, not an
  // interactive one — the ring drew a box around the whole panel the moment it mounted,
  // which reads as a selected element rather than an announcement. Safe to suppress: at
  // `tabIndex={-1}` this is unreachable by Tab, so no keyboard user can land here and be
  // left without an indicator.
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
 * Centres a short fallback body — but only into space the viewer can actually see.
 *
 * `DrawerBody` fills a bottom sheet that is `h-dvh` (vaul computes its snap translates off
 * the window height) while the mobile snap shows only its top 300px, so a plain
 * `justify-center` puts content at roughly `1.5·viewport − 300` from the top — measured at
 * 643px in a 667px viewport, i.e. off screen. That is why these states were invisible on
 * every phone.
 *
 * Two parts, and both are load-bearing:
 *
 *  - `max-h` off `--sy-sheet-top`, the sheet's live top edge mirrored every frame by
 *    DrawerStack, so the box can't extend far past the fold. The `0px` fallback resolves to
 *    the full height, which is right on the desktop panel and the map-less container, where
 *    the body already IS the visible area. It still over-measures by the header's height —
 *    the box starts below the header, not at the sheet's edge — which is why the second
 *    part matters.
 *  - **Auto margins rather than `justify-center`.** They centre when there is slack and
 *    collapse to nothing when there isn't, so tall content starts at the top and scrolls in
 *    the body. `justify-center` instead clips the overflowing TOP, which would hide the
 *    sentence and leave only the buttons — the failure mode of a fix for invisible content.
 */
export const CENTERED_BODY =
  'flex h-full max-h-[calc(100dvh_-_var(--sy-sheet-top,0px))] flex-col items-center p-6 text-center [&>:first-child]:mt-auto [&>:last-child]:mb-auto'

/**
 * The other posture: top-left, no centring at all.
 *
 * For the **list views** (Countries, Region, Online, Search). There the fallback replaces
 * a list — content that begins at the top-left of the body — so centring it moves the
 * sentence away from where the reader's eye already is and makes the drawer look like a
 * different kind of screen. Nothing needs the `max-h` guard here either: content that
 * starts at the top is on screen by construction, which is the whole thing `CENTERED_BODY`
 * has to work for.
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
 * The presentation, with nothing that can fail: the sentence in its register (carrying the
 * onward link), the action row beneath it, and — when offered — a field. Rendered both by
 * the live body and by the floor it degrades to, so the two can't look like different
 * screens.
 *
 * ONE column at ONE width. Every part is `w-full` inside a single `max-w-xs` box, because
 * left to shrink-wrap they came out three different widths stacked on a centre line: a
 * banner as wide as its sentence, a button row as wide as its labels, a full-width field.
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
        {/* `textAlign="left"` explicitly, not by default: the centred posture sets
            `text-center` on the container, and a sentence centred inside its own banner is
            harder to read and costs the onward link its left edge. */}
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
        {/* `text-start` for the same reason, and here it's functional: a centred
            placeholder in an input reads as a broken field. The field carries its own
            prompt ("Or search for a place"), so it needs no label line above it. */}
        {actionProps.actions.search && children && (
          <div className="w-full text-start">{children}</div>
        )}
      </div>
    </FallbackRegion>
  )
}

/** Layer 2: the only part that reads data. Split out so a throw here costs the offer and
 *  the field, never the sentence or the frame around it. */
function FallbackBody({ actions, offer, children, ...shellProps }: FallbackShellProps) {
  // Hook order can't be conditional, so the ladder runs even when the caller already
  // supplied a rung. It's total and reads no network, so the cost is a memo.
  const laddered = useRecoveryOffer()

  return (
    <FallbackShell {...shellProps} actions={actions} offer={offer ?? laddered}>
      {children}
    </FallbackShell>
  )
}

export type FallbackPanelProps = {
  /** Which row of `ERROR_POLICY` governs the copy, the register and the controls. */
  kind: FallbackKind
  /** Override the policy's sentence — see `FallbackMessage`. */
  message?: FallbackMessage
  /** The thrown message, for the report CTA. Absent for an empty list: nothing threw. */
  reportContext?: string
  /**
   * Where `onward` leads, when the caller knows better than the recovery ladder — the
   * country-site rung, which is decided from the searched country rather than the URL's
   * ancestry. Omitted, the ladder chooses.
   */
  offer?: RecoveryOffer
  resetErrorBoundary?: () => void
  onClearFilters?: () => void
  /**
   * Where the panel sits in its body. `center` (the default) is the posture for a drawer
   * whose whole content this replaces; `start` is for the LIST views, where the fallback
   * stands in for content that begins at the top-left and centring it would move the
   * sentence away from where the reader is already looking.
   */
  align?: FallbackAlign
  /** The surface already leads with a geocoder, so this must not draw a second one. */
  hasSearchChrome?: boolean
  /**
   * The geocoder for the `search` action, passed in rather than imported: it wraps a
   * Mapbox custom element that lives in the organisms layer, and this component is
   * rendered from organisms too. A caller that can't supply one simply doesn't.
   */
  children?: ReactNode
}

/**
 * The one body every state with no content renders — a dead link, a broken query, an
 * empty list (issue #89). What it says and what it offers come entirely from
 * `ERROR_POLICY`, so the three used to be three components that agreed by hand and are now
 * one component reading one table.
 *
 * Built in layers, because THE FALLBACK MUST NEVER THROW — it runs where a throw escapes
 * to the app-level boundary and blanks the whole widget inside someone else's page:
 *
 *   1 — copy + policy (`useFallbackDisplay`, `visibleActions`): pure, and falls back to the
 *       `unknown` row rather than dereferencing a missing one.
 *   2 — the offer (`useRecoveryOffer`) and the geocoder: three cache reads and a custom
 *       element, so they sit behind their OWN boundary and degrade to the floor rung —
 *       "Browse all countries", which needs no data at all — reporting why via
 *       `reportInternalError`.
 *
 * The floor keeps layer 1's retry and report: only the parts that actually failed are
 * dropped. Not `null`, either — unlike the report modal (off screen until asked), this IS
 * the screen, so failing to nothing would strand the viewer.
 */
export function FallbackPanel({
  kind,
  message,
  reportContext,
  offer,
  resetErrorBoundary,
  onClearFilters,
  align,
  hasSearchChrome,
  children,
}: FallbackPanelProps) {
  const { policy, message: text } = useFallbackDisplay(kind, message)
  const actions = visibleActions(policy, {
    canRetry: !!resetErrorBoundary,
    canClearFilters: !!onClearFilters,
    hasSearchChrome,
  })

  const shared = {
    policy,
    message: text,
    reportContext: reportContext ?? text,
    resetErrorBoundary,
    onClearFilters,
    align,
  }

  return (
    <ErrorBoundary
      fallbackRender={() => (
        // A caller-supplied rung is static data, so it survives — only what the ladder and
        // the geocoder contribute is dropped.
        <FallbackShell
          {...shared}
          actions={{ ...actions, search: false }}
          offer={offer ?? COUNTRIES_OFFER}
        />
      )}
      onError={(cause) => reportInternalError(cause, 'FallbackPanel')}
    >
      <FallbackBody {...shared} actions={actions} offer={offer}>
        {children}
      </FallbackBody>
    </ErrorBoundary>
  )
}

/**
 * An `ErrorBoundary` whose reset actually re-runs the failed query.
 *
 * `resetErrorBoundary` alone re-renders the subtree onto a query still parked in its error
 * state, which throws again on the spot — a "Try again" that visibly does nothing. Pairing
 * every boundary with `QueryErrorResetBoundary`'s `reset` is what fixes that, and wiring
 * it here means a new boundary cannot be added without it (issue #89).
 *
 * Deliberately does NOT bundle a `Suspense`: the five call sites nest one differently —
 * outside the boundary, inside it, or not at all — and normalizing that would move
 * loading states nobody asked to move.
 */
export function ResetErrorBoundary({ children, onReset, ...props }: ErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          {...props}
          // COMPOSED, not overridden: a caller's own `onReset` has work of its own to do
          // (EventView mints a fresh `lazy`, since React caches a rejected one forever).
          // Assigning `reset` over the spread would swallow it silently — the exact class
          // of dead-retry bug this component exists to prevent.
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
  /** Supplied by the ErrorBoundary; wired through `ResetErrorBoundary` so a retry re-runs
   *  the failed query instead of re-throwing its cached error. */
  resetErrorBoundary?: () => void
}

/**
 * The app-level error-boundary fallback — the whole-widget screen, shown when the app
 * fails to boot at all. It must never throw itself, so the thrown value goes through
 * `useErrorDisplay` rather than being dereferenced; the drawer's `FallbackPanel` shares
 * that hook and this action row, so one failure says and offers the same thing wherever
 * it surfaces.
 *
 * `canNavigate: false` is the honest surface limit here, not a style choice: the drawer
 * stack never mounted, so an onward link would change the URL and leave this same screen
 * on top of it. `visibleActions` restores the report CTA in its place.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const { policy, message, reportContext } = useErrorDisplay(error)
  const actions = visibleActions(policy, {
    canRetry: !!resetErrorBoundary,
    canNavigate: false,
  })

  return (
    <FallbackRegion className={APP_SURFACE} message={message}>
      {/* Same one-column, one-width rule as the drawer body's shell — and the same
          left-aligned banner inside a centred panel. */}
      <div className="flex w-full max-w-xs flex-col items-start gap-3">
        <Alert
          className="w-full"
          color={policy.color}
          description={message}
          role={policy.color === 'danger' ? 'alert' : 'status'}
          textAlign="left"
          title="Sahaj Atlas"
        />
        {/* The modal host is mounted outside this boundary (App.tsx), so the report CTA
            still works while this fallback is what's on screen. */}
        <FallbackActions
          actions={actions}
          reportContext={reportContext}
          resetErrorBoundary={resetErrorBoundary}
        />
      </div>
    </FallbackRegion>
  )
}
