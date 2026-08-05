import type { ErrorKind } from '@/lib/report'

import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { useReportModal } from '@/config/store'
import { classifyError, errorMessage } from '@/lib/report'

export function LoadingFallback() {
  const { t } = useTranslation('common')

  return (
    <div className="flex-center h-full w-full bg-background p-10">
      <Spinner color="secondary" label={t('loading')} />
    </div>
  )
}

/** The copy + actions one failure kind is allowed to render. */
export type ErrorPolicy = {
  /** `common` namespace key for the sentence shown in place of the thrown string. */
  messageKey: string
  /**
   * English text for when that key can't be resolved. Nothing is bundled — every
   * namespace is fetched over HTTP — so a failure that happens BEFORE the locale JSON
   * lands would otherwise render the raw key ("error.offline") at the viewer. For a
   * network failure it never recovers, since the JSON travels the link that just broke.
   */
  fallbackText: string
  /** Reset the boundary and re-run the failed query. */
  retry: boolean
  /** Open the report modal, carrying the thrown message as context (issue #79). */
  report: boolean
}

/**
 * The action table (issue #89). Kept as data so neither fallback hard-codes a button
 * list — they render the same policy in their own chrome.
 *
 * It lives here rather than beside `classifyError` in `src/lib/report.ts` because it is
 * UI policy, not domain logic: `messageKey` is an i18next key and the three flags name
 * three specific buttons, and `src/lib/` is declared React-free and i18n-free. The pure
 * half — what KIND of failure this is — stays in lib, where it's testable in isolation.
 *
 * `report` is always the lowest-weight CTA in both fallbacks, so the spec's "secondary"
 * needs no axis of its own: on `server` it sits under a retry that's likelier to help;
 * on `config`/`contract` it's the only thing offered, and so the only thing to look at.
 */
export const ERROR_POLICY: Record<ErrorKind, ErrorPolicy> = {
  // Connectivity is not something the team can act on, and the report POST (#80) needs
  // the very network that just failed — so no report CTA. Only reached when the BROWSER says we're offline; an
  // ambiguous network failure is `server`, which keeps the report CTA.
  offline: {
    messageKey: 'error.offline',
    fallbackText: 'You appear to be offline.',
    retry: true,
    report: false,
  },
  server: {
    messageKey: 'error.server',
    fallbackText: 'Our servers are having trouble right now.',
    retry: true,
    report: true,
  },
  // A dead link offers none of these three. The drawer renders it in the empty-state
  // register instead — a neutral note plus somewhere real to go, chosen by
  // `useRecoveryOffer` (views/shared). At the app level, where no drawer stack is mounted
  // to navigate into, `visibleActions` restores the report CTA so it's never a dead end.
  'not-found': {
    messageKey: 'error.not_found',
    fallbackText: "We couldn't find that page.",
    retry: false,
    report: false,
  },
  // The embed is misconfigured, or SahajCloud's shape drifted. Both need a human;
  // neither is fixed by pressing anything.
  config: {
    messageKey: 'error.config',
    fallbackText: "This Atlas embed isn't set up correctly.",
    retry: false,
    report: true,
  },
  contract: {
    messageKey: 'error.generic',
    fallbackText: 'Something went wrong.',
    retry: false,
    report: true,
  },
  unknown: {
    messageKey: 'error.generic',
    fallbackText: 'Something went wrong.',
    retry: true,
    report: true,
  },
}

/**
 * Everything a fallback needs to render one failure: which buttons, what sentence, and
 * what to attach to a report. Both fallbacks call this, so the rule "show localized copy,
 * report the thrown string" is stated once and can't drift between the two surfaces.
 *
 * `useSuspense: false` because this can render before any locale JSON has arrived (an
 * embed with no API key throws on the very first render). Suspending HERE would push the
 * tree back to the parent's loading fallback and show nothing at all; an untranslated
 * label beats a blank widget when the whole point is to surface the failure.
 */
export function useErrorDisplay(error: unknown) {
  const { t } = useTranslation('common', { useSuspense: false })
  const kind = classifyError(error)
  // `?? unknown` so the lookup can't come back undefined and take the next line down with
  // it. `classifyError` is total by construction, but its own-property check resolves
  // `hasOwnProperty` at call time — and we run inside host pages that are free to patch
  // Object.prototype. This is the one dereference that could break the promise both
  // fallbacks are built on: throwing from HERE escapes the only boundary in the tree and
  // unmounts the whole widget.
  const policy = ERROR_POLICY[kind] ?? ERROR_POLICY.unknown
  // The thrown developer string is not the headline — it's untranslated text written for
  // us, rendered to a viewer inside someone else's page. It survives as report context
  // only (issue #89). `defaultValue` so an unloaded namespace renders English rather than
  // the raw key; see `fallbackText`.
  const message = t(policy.messageKey, { defaultValue: policy.fallbackText })

  // `kind` rides along because the drawer splits on it: `not-found` renders the dead-end
  // register (a neutral note plus somewhere to go) rather than the broken one.
  return { kind, policy, message, reportContext: errorMessage(error) ?? message }
}

export type ErrorActionsProps = {
  /** The classified failure's policy — which of the three buttons may render. */
  policy: ErrorPolicy
  /** The thrown message, carried into the report as context (issue #79). */
  reportContext: string
  /** Reset the boundary and re-run the failed query. Absent ⇒ no retry is possible. */
  resetErrorBoundary?: () => void
}

/**
 * Which buttons survive once the SURFACE has narrowed what the failure permits — there may
 * be no boundary to reset.
 *
 * Never strands a viewer with no way out: if narrowing leaves nothing, the report CTA comes
 * back regardless of the policy. An error screen with no buttons at all is the one outcome
 * worse than the wrong button — and it is exactly what `not-found` would produce here,
 * since its own recovery lives in the drawer's dead-end body rather than in these buttons.
 * Pure, so the invariant is testable without a DOM.
 */
export const visibleActions = (policy: ErrorPolicy, { canRetry }: { canRetry: boolean }) => {
  const retry = policy.retry && canRetry

  return { retry, report: policy.report || !retry }
}

/**
 * The buttons an error is allowed to offer, rendered from the policy rather than a
 * hard-coded list (issue #89) — so the app-level and drawer fallbacks can differ in chrome
 * without ever drifting on what a given failure lets you do.
 *
 * Order is weight order: the action likeliest to help first, the report CTA last.
 */
export function ErrorActions({ policy, reportContext, resetErrorBoundary }: ErrorActionsProps) {
  // `useSuspense: false` for the same reason `useErrorDisplay` sets it: this can render
  // before any locale JSON has arrived. `defaultValue` on each label for the same reason
  // again — a raw "error.retry" on a button is worse than an untranslated one.
  const { t } = useTranslation('common', { useSuspense: false })
  const openReport = useReportModal((state) => state.openReport)

  const { retry: showRetry, report: showReport } = visibleActions(policy, {
    canRetry: !!resetErrorBoundary,
  })

  return (
    <>
      {showRetry && (
        <Button variant="flat" onClick={resetErrorBoundary}>
          {t('error.retry', { defaultValue: 'Try again' })}
        </Button>
      )}
      {/* If it's us rather than the link, a way to tell us so, carrying the thrown message
          as report context (issue #79). Suppressed for `offline`: connectivity isn't ours
          to fix, and the report POST (#80) needs the same network that just failed — but
          only while something else is on offer. */}
      {showReport && (
        <Button size="sm" variant="ghost" onClick={() => openReport(reportContext)}>
          {t('report.title', { defaultValue: 'Report an issue' })}
        </Button>
      )}
    </>
  )
}

export type ErrorFallbackProps = {
  /** Whatever was thrown — `unknown`, since a rejection need not be an Error. */
  error: unknown
  /** Supplied by the ErrorBoundary; wired through QueryErrorResetBoundary (App.tsx) so
   *  a retry re-runs the failed query instead of re-throwing its cached error. */
  resetErrorBoundary?: () => void
}

/**
 * The app-level error-boundary fallback — the whole-widget screen, shown when the app
 * fails to boot at all. It must never throw itself, so the thrown value goes through
 * `useErrorDisplay` rather than being dereferenced; DrawerErrorFallback shares that hook,
 * so one failure says and offers the same thing wherever it surfaces.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const { policy, message, reportContext } = useErrorDisplay(error)

  return (
    <div className="flex-center h-full w-full flex-col gap-3 bg-background p-10">
      <Alert
        className="max-w-xs"
        color="danger"
        description={message}
        role="alert"
        title="Sahaj Atlas"
      />
      {/* The modal host is mounted outside this boundary (App.tsx), so the report CTA
          still works while this fallback is what's on screen. No recovery ladder here: the
          drawer stack isn't mounted when the app failed to boot, so there is nowhere
          in-widget to send anyone — `visibleActions` restores the report CTA instead. */}
      <ErrorActions
        policy={policy}
        reportContext={reportContext}
        resetErrorBoundary={resetErrorBoundary}
      />
    </div>
  )
}
