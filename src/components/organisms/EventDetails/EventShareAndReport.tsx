import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { ShareRow } from '@/components/molecules/ShareContent'
import { useReportModal } from '@/config/store'
import { useReportForm } from '@/hooks/use-report-form'
import { useViewerCountry } from '@/hooks/use-viewer-country'

/**
 * Under a class's Register beside the inline map: its share targets themselves (`ShareRow`), with
 * room for them there, then the way to report details that are wrong.
 */
export function EventShareAndReport({ label, url }: { label: string; url?: string }) {
  const country = useViewerCountry()

  return (
    <>
      {url && (
        <div className="border-t border-divider pt-4">
          <ShareRow country={country} label={label} url={url} />
        </div>
      )}
      <ReportDetailsLink />
    </>
  )
}

/**
 * "Report incorrect class details": the report form, which names the class by the page it was
 * sent from. Only where this atlas has a report form at all (#216).
 */
function ReportDetailsLink() {
  const { t } = useTranslation()
  const { enabled } = useReportForm()
  const openReport = useReportModal((state) => state.openReport)

  if (!enabled) return null

  return (
    <div className="border-t border-divider pt-1">
      <Button
        className="-ms-1 gap-2 px-1 text-primary-11"
        size="sm"
        variant="ghost"
        onClick={() => openReport()}
      >
        <Flag aria-hidden size={16} />
        <span className="underline decoration-primary-7 underline-offset-4">
          {t('event.display.report_details')}
        </span>
      </Button>
    </div>
  )
}
