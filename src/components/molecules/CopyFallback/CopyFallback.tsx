import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useCoarsePointer } from '@/config/responsive'

export interface CopyFallbackProps {
  /** The link the clipboard refused. */
  url: string
}

/**
 * What a Copy shows when the clipboard refuses it, as a host's Permissions-Policy or a page that
 * is not https does: it says so and selects the whole link for a copy by hand, rather than a tap
 * that appears to do nothing. Its callers mount it on each refusal, so the link is selected again.
 */
export function CopyFallback({ url }: CopyFallbackProps) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()
  const link = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (link.current) window.getSelection()?.selectAllChildren(link.current)
  }, [url])

  return (
    <>
      <p className="text-sm text-danger-11" role="alert">
        {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
      </p>
      <p ref={link} className="text-center text-xs break-all text-gray-11 select-all" title={url}>
        {url}
      </p>
    </>
  )
}
