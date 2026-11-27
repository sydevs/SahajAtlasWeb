import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Share } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { useCoarsePointer } from '@/config/responsive'
import { useCopy } from '@/hooks/use-copy'
import { useShareUrl } from '@/hooks/use-share-url'
import { useWebShare } from '@/hooks/use-web-share'
import { HEADER_CONTROL } from '@/views/shared'

/**
 * Sends a link to the place and the seven days on screen. The device's share menu opens where
 * there is one, and backing out of it copies nothing; elsewhere the link is copied and a tick
 * says so, and where copying is refused too the link shows selected, to copy by hand.
 */
export function ShareWeek({ route, dates }: { route: string; dates: string }) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()
  const url = useShareUrl(null, route)
  const { canShare, share } = useWebShare()
  const { copied, copy } = useCopy(2500)
  const [failed, setFailed] = useState(false)
  const linkRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (failed && linkRef.current) window.getSelection()?.selectAllChildren(linkRef.current)
  }, [failed])

  // No link to give where the route is in no address (a memory-routed embed).
  if (!url) return null

  const onClick = async () => {
    const title = t('calendar.share_title', { dates })

    if (canShare && (await share({ title, url })) !== 'unavailable') return
    setFailed(!(await copy(url)))
  }

  return (
    <>
      <Button
        {...HEADER_CONTROL}
        aria-label={copied ? t('share.link_copied') : t('share.native')}
        onClick={() => void onClick()}
      >
        {copied ? <Check size={20} strokeWidth={3} /> : <Share size={20} />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? t('share.link_copied') : ''}
      </span>
      {failed && (
        <div className="w-full" role="alert">
          <p className="text-sm text-danger-11">
            {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
          </p>
          <p ref={linkRef} className="text-xs break-all text-gray-11 select-all">
            {url}
          </p>
        </div>
      )}
    </>
  )
}
