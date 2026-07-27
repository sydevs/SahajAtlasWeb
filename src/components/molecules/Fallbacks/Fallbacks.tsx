import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { useReportModal } from '@/config/store'
import { errorMessage } from '@/lib/report'

export function LoadingFallback() {
  const { t } = useTranslation('common')

  return (
    <div className="flex-center h-full w-full bg-background p-10">
      <Spinner color="secondary" label={t('loading')} />
    </div>
  )
}

export type ErrorFallbackProps = {
  /** Whatever was thrown — `unknown`, since a rejection need not be an Error. */
  error: unknown
}

/**
 * The app-level error-boundary fallback. It must never throw itself, so the thrown
 * value is narrowed by the shared `errorMessage` helper rather than dereferenced —
 * the same narrowing DrawerErrorFallback uses, so one failure reads the same in both.
 */
export function ErrorFallback({ error }: ErrorFallbackProps) {
  // `useSuspense: false` — react-i18next suspends by default while a namespace loads, and
  // this fallback can render before any locale JSON has arrived (an embed with no
  // api-key throws on the very first render). Suspending HERE would push the tree back to
  // the parent's loading fallback and show nothing at all; an untranslated label beats a
  // blank widget when the whole point is to surface the failure.
  const { t } = useTranslation('common', { useSuspense: false })
  const description = errorMessage(error) ?? t('error.generic')
  const openReport = useReportModal((state) => state.openReport)

  return (
    <div className="flex-center h-full w-full flex-col gap-3 bg-background p-10">
      <Alert
        className="max-w-xs"
        color="danger"
        description={description}
        role="alert"
        title="Sahaj Atlas"
      />
      {/* The modal host is mounted outside this boundary (App.tsx), so the CTA still
          works while this fallback is what's on screen. The thrown message rides along
          as report context (issue #79). */}
      <Button variant="flat" onClick={() => openReport(description)}>
        {t('report.title')}
      </Button>
    </div>
  )
}
