import type { ErrorPolicy } from '@/lib/report'

import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { useReportModal } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { errorMessage, errorPolicy } from '@/lib/report'

export function LoadingFallback() {
  const { t } = useTranslation('common')

  return (
    <div className="flex-center h-full w-full bg-background p-10">
      <Spinner color="secondary" label={t('loading')} />
    </div>
  )
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
 * The buttons an error is allowed to offer, rendered from the policy rather than a
 * hard-coded list (issue #89) — so the app-level and drawer fallbacks can differ in
 * chrome without ever drifting on what a given failure lets you do.
 *
 * Order is weight order: the action likeliest to help first, the report CTA last.
 */
export function ErrorActions({ policy, reportContext, resetErrorBoundary }: ErrorActionsProps) {
  // `useSuspense: false` for the same reason ErrorFallback below sets it: this can render
  // before any locale JSON has arrived, and an untranslated label beats a blank widget.
  const { t } = useTranslation('common', { useSuspense: false })
  const { t: tEvents } = useTranslation('events', { useSuspense: false })
  const navigate = useAtlasNavigate()
  const openReport = useReportModal((state) => state.openReport)

  return (
    <>
      {policy.retry && resetErrorBoundary && (
        <Button variant="flat" onClick={resetErrorBoundary}>
          {t('error.retry')}
        </Button>
      )}
      {/* A dead direct link (e.g. a finished event the CMS no longer serves)
          still offers a way back into live inventory (issue #52). */}
      {policy.nearby && (
        <Button color="primary" variant="flat" onClick={() => navigate('/search')}>
          {tEvents('display.see_nearby')}
        </Button>
      )}
      {/* …and if it's us rather than the link, a way to tell us so, carrying the thrown
          message as report context (issue #79). Never offered for `offline`:
          connectivity isn't ours to fix, and the report POST (#80) needs the same
          network that just failed. */}
      {policy.report && (
        <Button size="sm" variant="ghost" onClick={() => openReport(reportContext)}>
          {t('report.title')}
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
 * The app-level error-boundary fallback. It must never throw itself, so the thrown value
 * is narrowed by the shared `errorPolicy` helper rather than dereferenced — the same
 * narrowing DrawerErrorFallback uses, so one failure reads the same in both.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  // `useSuspense: false` — react-i18next suspends by default while a namespace loads, and
  // this fallback can render before any locale JSON has arrived (an embed with no
  // api-key throws on the very first render). Suspending HERE would push the tree back to
  // the parent's loading fallback and show nothing at all; an untranslated label beats a
  // blank widget when the whole point is to surface the failure.
  const { t } = useTranslation('common', { useSuspense: false })
  const policy = errorPolicy(error)
  // The thrown developer string is not the headline — it's untranslated text written for
  // us, rendered to a viewer inside someone else's page. It survives as report context
  // only (issue #89).
  const message = t(policy.messageKey)

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
          still works while this fallback is what's on screen. */}
      <ErrorActions
        policy={policy}
        reportContext={errorMessage(error) ?? message}
        resetErrorBoundary={resetErrorBoundary}
      />
    </div>
  )
}
