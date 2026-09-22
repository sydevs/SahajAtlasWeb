import type { Client } from '@/types'

import { useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
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
import { useReportForm, useReportFormDocument } from '@/hooks/use-report-form'
import { buildReportContext } from '@/lib/report'

export type ReportIssueModalProps = {
  apiKey: string | undefined | null
}

/**
 * This is the single mounted host for the report-issue modal (issues #79, #216).
 * It owns the chrome and the two boundaries; the panel below owns the form and its context.
 *
 * The app mounts this outside the app's ErrorBoundary, so the error CTAs can still open it while
 * that boundary is rendering ErrorFallback. For the same reason, the client name is read from the
 * query CACHE rather than fetched. When the boundary caught a failed `clients/me`, there simply is
 * no client, and the report goes out without that field, instead of suspending or throwing a
 * second time.
 *
 * The form read itself is mounted for the widget's whole life by `useReportForm`, never on open:
 * this modal is most often reached from a failure — often the network — and a read fired at that
 * moment would be the second thing to fail.
 */
export function ReportIssueModal({ apiKey }: ReportIssueModalProps) {
  const { t } = useTranslation()
  const { formId } = useReportForm()

  const open = useReportModal((state) => state.open)
  const error = useReportModal((state) => state.error)
  const closeReport = useReportModal((state) => state.closeReport)

  return (
    // Everything inside is built only while the modal is open. This host is mounted for the app's
    // whole life and calls useLocation(), so it re-renders on every navigation, filter change and
    // sort change. JSX children are ordinary evaluated arguments.
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
          {/* The two states a read can be in, each answered by the mechanism built for it: the
              Suspense fallback covers "not here yet", the boundary covers "could not be read". The
              affordance appears as soon as the CONFIG lands, a round trip ahead of the form, so on
              the one screen a viewer reaches BECAUSE something already failed, a false alarm in
              that window would be the worst available guess. Both boundaries sit INSIDE the chrome
              on purpose — a viewer who opened this must keep a titled, dismissable dialog. */}
          <ErrorBoundary fallbackRender={() => <ReportUnavailable onClose={closeReport} />}>
            <Suspense
              fallback={
                <ModalBody>
                  <div className="flex justify-center py-8">
                    <Spinner color="secondary" srLabel={t('common.chrome.loading')} />
                  </div>
                </ModalBody>
              }
            >
              {/* No form, no send: the collection refuses a `contact` row that names none. Every
                  affordance is gated on the id, so this is unreachable rather than an empty
                  state. */}
              {formId === null ? (
                <ReportUnavailable onClose={closeReport} />
              ) : (
                <ReportIssuePanel
                  apiKey={apiKey}
                  error={error}
                  formId={formId}
                  onClose={closeReport}
                />
              )}
            </Suspense>
          </ErrorBoundary>
        </ModalContent>
      )}
    </Modal>
  )
}

type ReportIssuePanelProps = {
  apiKey: string | undefined | null
  error: string | null | undefined
  formId: number
  onClose: () => void
}

/**
 * The authored form, plus the context the viewer never types.
 *
 * It mounts only while the modal is open, so `buildReportContext` reads the browser globals once
 * per opening rather than on every navigation the host above re-renders through.
 */
function ReportIssuePanel({ apiKey, error, formId, onClose }: ReportIssuePanelProps) {
  const { locale } = useLocale()
  const location = useLocation()
  const queryClient = useQueryClient()
  const form = useReportFormDocument(formId)

  return (
    <ReportIssueForm
      context={buildReportContext({
        path: location.pathname,
        locale,
        client: queryClient.getQueryData<Client>(clientQuery(apiKey).queryKey)?.name,
        error,
      })}
      form={form}
      onClose={onClose}
    />
  )
}

/** Shown when the form could not be read, or when this atlas names none. */
function ReportUnavailable({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <ModalBody>
        <Alert align="start" color="danger" description={t('common.errors.generic')} role="alert" />
      </ModalBody>
      <ModalFooter>
        <Button color="primary" variant="flat" onClick={onClose}>
          {t('common.chrome.close')}
        </Button>
      </ModalFooter>
    </>
  )
}
