import { type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

import { useCoarsePointer } from '@/config/responsive'

/**
 * The link as text, for `useCopy` to select when a host refuses the clipboard. It stays in the
 * DOM either way, so a failed copy has something to select; once one has, the hint above it says
 * how to finish by hand.
 */
export function CopyFailedCaption({
  url,
  failed,
  captionRef,
  className,
}: {
  url: string
  failed: boolean
  captionRef: Ref<HTMLParagraphElement>
  className?: string
}) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {failed && (
        <p className="text-sm text-danger-11" role="alert">
          {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
        </p>
      )}
      <p
        ref={captionRef}
        className={clsx('text-xs text-gray-11 select-all', failed ? 'break-all' : 'truncate')}
        title={url}
      >
        {url}
      </p>
    </div>
  )
}
