import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Download } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'
import { type QrMatrix, encodeQr, qrFileName, qrPngBlob, qrSvgPath } from '@/lib/share/qr'

export type QrPosterProps = {
  /** The class title, for the code's accessible name and the file name. */
  label: string
  /** What the code opens. */
  url: string
  /** Told when the row opens, so a bottom sheet can make room for the code. */
  onOpen?: () => void
}

function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = href
  anchor.download = fileName
  // The same dance as the calendar file: Firefox needs the anchor in the document, and Safari
  // cancels the download if the URL is revoked in the same tick.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/**
 * A QR code of the class link, for hosts printing posters. Most people opening Share want to send
 * a link to a friend, so this stays closed behind one row until asked for, and the encoder only
 * downloads at that point (`encodeQr`).
 */
export function QrPoster({ label, url, onOpen }: QrPosterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [matrix, setMatrix] = useState<QrMatrix | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return

    let current = true

    setFailed(false)
    encodeQr(url)
      .then((result) => current && setMatrix(result))
      .catch(() => current && setFailed(true))

    return () => {
      current = false
    }
  }, [open, url])

  const path = useMemo(() => (matrix ? qrSvgPath(matrix) : ''), [matrix])

  const download = async () => {
    const blob = matrix && (await qrPngBlob(matrix))

    if (blob) saveBlob(blob, qrFileName(label))
  }

  return (
    <section className="border-t border-divider">
      <button
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 text-start text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
        type="button"
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
      >
        {t('share.qr_title')}
        <ChevronDown
          aria-hidden
          className={clsx('shrink-0 text-gray-11 transition-transform', open && 'rotate-180')}
          size={20}
        />
      </button>

      {open && (
        <div className="flex flex-col items-center gap-3 pb-4">
          {failed ? (
            <p className="w-full text-sm text-danger-11" role="alert">
              {t('share.qr_failed')}
            </p>
          ) : matrix ? (
            <>
              {/* Always black on white, in dark mode too: scanners need dark on light. */}
              <svg
                aria-label={t('share.qr_alt', { title: label })}
                className="h-44 w-44 rounded border border-divider bg-white"
                role="img"
                shapeRendering="crispEdges"
                viewBox={`0 0 ${matrix.length} ${matrix.length}`}
              >
                <path d={path} fill="#000" />
              </svg>
              <p className="w-full text-sm text-gray-11">{t('share.qr_hint')}</p>
              <Button
                className="w-full text-primary-12"
                color="primary"
                size="lg"
                variant="bordered"
                onClick={download}
              >
                <Download aria-hidden size={18} />
                {t('share.qr_download')}
              </Button>
            </>
          ) : (
            <div className="flex h-44 items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
