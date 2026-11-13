import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import * as Popover from '@radix-ui/react-popover'
import { Check, Share } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { panelChrome } from '@/components/atoms/Select'
import { CopyFallback } from '@/components/molecules/CopyFallback'
import { useHrefFor } from '@/config/routing'
import { useWebShare } from '@/hooks/use-web-share'
import { calendarShareRoute } from '@/lib/shape'
import { frameCollision, overlayContainer } from '@/lib/overlay'

/** How long the button holds its tick. */
const COPIED_MS = 2000

export interface ShareDatesProps {
  /** The first and last day on screen, ISO dates. */
  start: string
  end: string
  /** The dates as the header writes them, for the share sheet's title. */
  label: string
}

/**
 * Shares the dates on screen, with the scope and filters that were applied. The dates are written
 * into the link even when the visitor is looking at the next seven days, because a link sent today
 * should still mean those days when it is opened next Tuesday. A phone opens its own share sheet;
 * anywhere else (most computers have none), or when that is blocked or dismissed, the link is
 * copied. The button keeps its size when it confirms, so the header doesn't move. Where the
 * clipboard is refused too, as in a frame without clipboard access, a popover shows the link
 * selected, as the class's Share block does under Copy link.
 */
export function ShareDates({ start, end, label }: ShareDatesProps) {
  const { t } = useTranslation()
  const hrefFor = useHrefFor()
  const { share } = useWebShare()
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [searchParams] = useSearchParams()
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Memory-routed embeds have no address to link to, so there is nothing to offer.
  if (!hrefFor) return null

  const url = hrefFor(calendarShareRoute(searchParams, start, end))

  const onShare = async () => {
    window.clearTimeout(timer.current)
    // `share` always answers with a word, never `false`: only `shared` means the job is done.
    if ((await share({ title: t('calendar.share_title', { dates: label }), url })) === 'shared')
      return

    try {
      await navigator.clipboard.writeText(url)
      setStatus('copied')
      timer.current = window.setTimeout(() => setStatus('idle'), COPIED_MS)
    } catch {
      setStatus('failed')
    }
  }
  const copied = status === 'copied'
  const name = copied ? t('calendar.link_copied') : t('event.actions.share')

  return (
    <Popover.Root
      open={status === 'failed'}
      onOpenChange={(open) => {
        if (!open) setStatus('idle')
      }}
    >
      {/* An anchor, not a trigger: the button shares first, and opens this only on a refusal. */}
      <Popover.Anchor asChild>
        <Button
          isIconOnly
          aria-label={name}
          size="sm"
          title={name}
          variant="ghost"
          onClick={onShare}
        >
          {copied ? <Check className="text-primary-11" size={20} /> : <Share size={20} />}
          <span aria-live="polite" className="sr-only">
            {copied ? name : ''}
          </span>
        </Button>
      </Popover.Anchor>
      <Popover.Portal container={overlayContainer()}>
        <Popover.Content
          aria-label={t('event.actions.share')}
          className={panelChrome({
            class:
              'flex w-72 max-w-[var(--radix-popover-content-available-width)] flex-col gap-2 p-3',
          })}
          sideOffset={8}
          {...frameCollision()}
          // It holds nothing to press, and moving focus into it would clear the selected link.
          // Its alert is announced from where focus already is; Esc and an outside press close it.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <CopyFallback url={url} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
