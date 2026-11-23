import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Download } from 'lucide-react'
import clsx from 'clsx'

import { saveBlob } from './download'
import { type QrMatrix, encodeQr, qrFileName, qrPngBlob, qrSvgPath } from './qr'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'

export type QrPosterProps = {
  /** The class title, for the code's accessible name and the file name. */
  label: string
  /** What the code opens. */
  url: string
  inline?: boolean
}

/**
 * A QR code of the class link, for hosts printing posters. Most people opening Share want to send
 * a link to a friend, so this stays closed behind one row until asked for, and the encoder only
 * downloads at that point (`encodeQr`).
 */
export function QrPoster({ label, url, inline = false }: QrPosterProps) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [matrix, setMatrix] = useState<QrMatrix | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open && !inline) return

    let current = true

    setMatrix(null)
    setFailed(false)
    encodeQr(url)
      .then((result) => current && setMatrix(result))
      .catch(() => current && setFailed(true))

    return () => {
      current = false
    }
  }, [open, url, inline])

  const path = useMemo(() => (matrix ? qrSvgPath(matrix) : ''), [matrix])

  const download = async () => {
    const blob = matrix && (await qrPngBlob(matrix))

    if (blob) saveBlob(blob, qrFileName(label))
  }

  const code = (className: string) =>
    matrix && (
      <svg
        aria-label={'QR code for ' + label}
        className={className + ' bg-white'}
        role="img"
        shapeRendering="crispEdges"
        viewBox={`0 0 ${matrix.length} ${matrix.length}`}
      >
        <path d={path} fill="#000" />
      </svg>
    )

  if (inline) {
    const title = 'Class QR code'

    return (
      <section className="flex items-center justify-between gap-3 border-t border-divider py-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {failed ? (
            <p className="text-sm text-danger-11" role="alert">
              The QR code couldn’t be loaded.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 text-sm text-primary-11 underline">
              <button
                className="min-h-11"
                disabled={!matrix}
                type="button"
                onClick={() => dialog.current?.showModal()}
              >
                Enlarge
              </button>
              <button className="min-h-11" disabled={!matrix} type="button" onClick={download}>
                Download for printing
              </button>
            </div>
          )}
        </div>
        {code('size-20')}
        <dialog
          ref={dialog}
          aria-label={title}
          className="fixed inset-0 m-auto w-[min(90vw,352px)] rounded-lg border border-divider bg-background p-4 text-foreground backdrop:bg-black/50"
        >
          {code('aspect-square w-full')}
          <Button
            className="mt-3 w-full"
            variant="bordered"
            onClick={() => dialog.current?.close()}
          >
            {t('common.chrome.close')}
          </Button>
        </dialog>
      </section>
    )
  }

  return (
    <section className="border-t border-divider">
      <button
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 text-start text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
        type="button"
        onClick={() => {
          setOpen(!open)
        }}
      >
        QR code for posters
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
              The QR code couldn’t be loaded.
            </p>
          ) : matrix ? (
            <>
              {/* Always black on white, in dark mode too: scanners need dark on light. */}
              {code('size-44 rounded border border-divider')}
              <p className="w-full text-sm text-gray-11">
                {
                  'Print this on posters or flyers. People can point their phone camera at it to open this class.'
                }
              </p>
              <Button
                className="w-full text-primary-12"
                color="primary"
                size="lg"
                variant="bordered"
                onClick={download}
              >
                <Download aria-hidden size={18} />
                Download for printing
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
