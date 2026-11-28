import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Check, Link } from 'lucide-react'

import { CopyFailedCaption } from './CopyFailed'
import { ROW_TARGET_CLASS, TARGET_CLASS } from './target'

import { useCopy } from '@/hooks/use-copy'

/**
 * Copy link, as one more disc in the grid. It answers on itself — a check and "Link copied" —
 * so the popover stays open. Where the host refuses the clipboard, the URL is selected below.
 */
export function CopyLinkTarget({ url, row = false }: { url: string; row?: boolean }) {
  const { t } = useTranslation()
  const { copied, failed, copy } = useCopy(2500)
  const captionRef = useRef<HTMLParagraphElement>(null)
  const label = copied ? t('share.link_copied') : t('share.copy_link')

  return (
    <>
      <button
        data-vaul-no-drag
        className={row ? ROW_TARGET_CLASS : TARGET_CLASS}
        type="button"
        onClick={() => void copy(url, captionRef.current)}
      >
        <span
          // In the row it leads in the brand's colour, as the page's own way to share.
          className={clsx(
            'flex items-center justify-center rounded-full',
            row ? 'size-12' : 'size-11',
            copied || row ? 'bg-primary-9 text-primary-foreground' : 'bg-gray-4 text-gray-12',
          )}
        >
          {copied ? (
            <Check aria-hidden size={20} strokeWidth={3} />
          ) : (
            <Link aria-hidden size={20} />
          )}
        </span>
        <span className="max-w-full truncate">{label}</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? t('share.link_copied') : ''}
      </span>
      {/* Kept in the DOM so a failed copy has the link to select, and shown once one has. */}
      <div className={failed ? 'order-last w-full' : 'hidden'}>
        <CopyFailedCaption captionRef={captionRef} failed={failed} url={url} />
      </div>
    </>
  )
}
