import type { Client } from '@/types'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { ReportIssueForm } from './ReportIssueForm'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Modal, ModalBody, ModalContent, ModalFooter } from '@/components/atoms/Modal'
import { Spinner } from '@/components/atoms/Spinner'
import { clientQuery } from '@/config/api'
import { reportReturnFocus, useReportModal } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useReportForm } from '@/hooks/use-report-form'
import { buildReportContext } from '@/lib/report'

export type ReportIssueModalProps = {
  apiKey: string | undefined | null
}

/**
 * This is the single mounted host for the report-issue modal (issues #79, #216).
 * It owns the chrome, fetches the authored form, and resolves the
 * auto-attached context — widget route, locale, client, host page, user
 * agent — so the form itself stays presentational.
 *
 * The app mounts this OUTSIDE the ErrorBoundary, so the error CTAs can
 * still open it while the boundary is rendering ErrorFallback. For the
 * same reason, the client name is read from the query CACHE, rather than
 * fetched. When the boundary caught a failed `clients/me`, there simply is
 * no client, and the report goes out without that field, instead of
 * suspending or throwing a second time.
 *
 * The form read runs HERE, for the widget's whole life, rather than on open. This
 * modal is most often reached from a failure — often the network — and a read
 * fired at that moment would be the second thing to fail. A failed read leaves the
 * panel below, never a throw: this host has no boundary above it worth the name.
 */
export function ReportIssueModal({ apiKey }: ReportIssueModalProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { form, isPending } = useReportForm()

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
          closeLabel={t('common.chrome.close')}
          description={t('common.report.description')}
          title={t('common.report.title')}
          onCloseAutoFocus={(event) => {
            const opener = reportReturnFocus()

            if (!opener) return

            event.preventDefault()
            opener.focus()
          }}
        >
          {form ? (
            <ReportIssueForm
              context={buildReportContext({
                path: location.pathname,
                locale,
                client: queryClient.getQueryData<Client>(clientQuery(apiKey).queryKey)?.name,
                error,
              })}
              form={form}
              onClose={closeReport}
            />
          ) : isPending ? (
            // The affordance appears as soon as the CONFIG lands, a round trip ahead of the form
            // itself. On the one screen a viewer reaches BECAUSE something already failed, a
            // false alarm in that window is the worst available guess.
            <ModalBody>
              <div className="flex justify-center py-8">
                <Spinner color="secondary" srLabel={t('common.chrome.loading')} />
              </div>
            </ModalBody>
          ) : (
            // No form, no send: the collection refuses a `contact` row that names none. Every
            // affordance is gated on the id, so a viewer reaches this only when the form itself
            // could not be read — which is a failure, not an empty state.
            <>
              <ModalBody>
                <Alert
                  align="start"
                  color="danger"
                  description={t('common.errors.generic')}
                  role="alert"
                />
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="flat" onClick={closeReport}>
                  {t('common.chrome.close')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      )}
    </Modal>
  )
}
