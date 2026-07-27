import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { Alert } from '@/components/atoms/Alert/Alert'
import { Button } from '@/components/atoms/Button'
import { useReportModal } from '@/config/store'

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
 * The app-level error-boundary fallback. It must never throw itself, so the
 * thrown value is narrowed rather than dereferenced: a thrown string or a
 * rejected non-Error would make `error.message` render `undefined` — or throw
 * inside the boundary's own fallback, which React cannot recover from.
 */
export function ErrorFallback({ error }: ErrorFallbackProps) {
  const { t } = useTranslation('common')
  const description = error instanceof Error ? error.message : String(error)
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
