import type { Client } from '@/types'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { ReportIssueForm } from './ReportIssueForm'

import { Modal, ModalContent } from '@/components/atoms/Modal'
import { clientQuery } from '@/config/api'
import { reportReturnFocus, useReportModal } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { buildReportContext } from '@/lib/report'

export type ReportIssueModalProps = {
  apiKey: string | undefined | null
}

/**
 * This is the single mounted host for the report-issue modal (issue #79).
 * It owns the chrome and resolves the auto-attached context — widget
 * route, locale, client, host page, user agent — so the form itself stays
 * presentational.
 *
 * The app mounts this OUTSIDE the ErrorBoundary, so the error CTAs can
 * still open it while the boundary is rendering ErrorFallback. For the
 * same reason, the client name is read from the query CACHE, rather than
 * fetched. When the boundary caught a failed `clients/me`, there simply is
 * no client, and the report goes out without that field, instead of
 * suspending or throwing a second time.
 */
export function ReportIssueModal({ apiKey }: ReportIssueModalProps) {
  const { t } = useTranslation('common')
  const { locale } = useLocale()
  const location = useLocation()
  const queryClient = useQueryClient()

  const open = useReportModal((state) => state.open)
  const error = useReportModal((state) => state.error)
  const closeReport = useReportModal((state) => state.closeReport)

  return (
    // Everything inside is built only while the modal is open. This host is
    // mounted for the app's whole life and calls useLocation(). So it
    // re-renders on every navigation, filter change, and sort change. JSX
    // children are ordinary evaluated arguments. So an ungated
    // `buildReportContext(...)` would read the browser globals and
    // allocate a context on each of those renders, only to be thrown away
    // unopened.
    <Modal open={open} onOpenChange={(next) => !next && closeReport()}>
      {open && (
        <ModalContent
          closeLabel={t('close')}
          description={t('report.description')}
          title={t('report.title')}
          onCloseAutoFocus={(event) => {
            const opener = reportReturnFocus()

            if (!opener) return

            event.preventDefault()
            opener.focus()
          }}
        >
          <ReportIssueForm
            context={buildReportContext({
              path: location.pathname,
              locale,
              client: queryClient.getQueryData<Client>(clientQuery(apiKey).queryKey)?.name,
              error,
            })}
            onClose={closeReport}
          />
        </ModalContent>
      )}
    </Modal>
  )
}
