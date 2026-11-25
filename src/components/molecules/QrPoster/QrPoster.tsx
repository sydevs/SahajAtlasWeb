import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Disclosure } from '@/components/atoms/Disclosure'
import { Spinner } from '@/components/atoms/Spinner'
import { saveBlob } from '@/lib/download'
import { type QrMatrix, encodeQr, qrFileName, qrPngBlob, qrSvgPath } from '@/lib/share/qr'

export type QrPosterProps = {
  /** The class title, for the code's spoken name and the file name. */
  label: string
  /** What the code opens. */
  url: string
  /** Told when the row opens, so a bottom sheet can make room for the code. */
  onOpen?: () => void
}

/**
 * A QR code of the class link, for hosts printing posters. Most people opening Share want to send
 * a link to a friend, so this stays closed behind one row, and the encoder only downloads once the
 * row opens (`encodeQr`).
 */
export function QrPoster({ label, url, onOpen }: QrPosterProps) {
  const { t } = useTranslation()

  return (
    <Disclosure title={t('share.qr_title')} onOpenChange={(open) => open && onOpen?.()}>
      {/* Keyed so a changed link never shows, or downloads, the old code. */}
      <QrCode key={url} label={label} url={url} />
    </Disclosure>
  )
}

type QrState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; matrix: QrMatrix }

/** Mounted by the open row, so each reopen after a failure tries the encoder again. */
export function QrCode({
  label,
  url,
  initial,
}: Pick<QrPosterProps, 'label' | 'url'> & { initial?: QrState }) {
  const { t } = useTranslation()
  const [state, setState] = useState<QrState>(initial ?? { status: 'loading' })

  useEffect(() => {
    if (initial) return

    let current = true

    encodeQr(url)
      .then((matrix) => current && setState({ status: 'ready', matrix }))
      .catch(() => current && setState({ status: 'failed' }))

    return () => {
      current = false
    }
  }, [url, initial])

  const matrix = state.status === 'ready' ? state.matrix : null
  const path = useMemo(() => (matrix ? qrSvgPath(matrix) : ''), [matrix])

  if (state.status === 'failed') {
    return (
      <p className="text-sm text-danger-11" role="alert">
        {t('share.qr_failed')}
      </p>
    )
  }

  if (!matrix) {
    return (
      <div className="flex h-44 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  const download = async () => {
    const blob = await qrPngBlob(matrix)

    if (blob) saveBlob(blob, qrFileName(label))
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Black on white in dark theme too: scanners need dark on light. */}
      <svg
        aria-label={t('share.a11y.qr_code', { title: label })}
        className="h-44 w-44 rounded-lg border border-divider bg-white"
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
    </div>
  )
}
