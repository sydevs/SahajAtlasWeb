import type { ErrorKind } from '@/lib/report'

import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { useReportModal } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { classifyError, errorMessage } from '@/lib/report'
import { searchPath } from '@/lib/shape'

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
  /** Reset the boundary and re-run the failed query. */
  retry: boolean
  /** Escape into live inventory via the search view (issue #52). */
  nearby: boolean
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
  // the very network that just failed — so no report CTA, and no nearby search (which
  // would fail identically).
  offline: { messageKey: 'error.offline', retry: true, nearby: false, report: false },
  server: { messageKey: 'error.server', retry: true, nearby: false, report: true },
  // A dead link isn't a wrong turn to retry — it's a way back into live inventory.
  'not-found': { messageKey: 'error.not_found', retry: false, nearby: true, report: false },
  // The embed is misconfigured, or SahajCloud's shape drifted. Both need a human;
  // neither is fixed by pressing anything.
  config: { messageKey: 'error.config', retry: false, nearby: false, report: true },
  contract: { messageKey: 'error.generic', retry: false, nearby: false, report: true },
  unknown: { messageKey: 'error.generic', retry: true, nearby: false, report: true },
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
  const policy = ERROR_POLICY[classifyError(error)]
  // The thrown developer string is not the headline — it's untranslated text written for
  // us, rendered to a viewer inside someone else's page. It survives as report context
  // only (issue #89).
  const message = t(policy.messageKey)

  return { policy, message, reportContext: errorMessage(error) ?? message }
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
  // `useSuspense: false` for the same reason `useErrorDisplay` sets it: this can render
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
        <Button color="primary" variant="flat" onClick={() => navigate(searchPath())}>
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
          still works while this fallback is what's on screen. */}
      <ErrorActions
        policy={policy}
        reportContext={reportContext}
        resetErrorBoundary={resetErrorBoundary}
      />
    </div>
  )
}
