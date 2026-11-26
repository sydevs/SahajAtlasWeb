import { type MouseEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Popover from '@radix-ui/react-popover'
import { Check, Link, Share } from 'lucide-react'

import { ShareTargets } from './platform-buttons'

import { tv } from '@/styles/tv'
import { Button } from '@/components/atoms/Button'
import { panelChrome } from '@/components/atoms/Select'
import { useCoarsePointer } from '@/config/responsive'
import { useCopy } from '@/hooks/use-copy'
import { useWebShare } from '@/hooks/use-web-share'
import { frameCollision, overlayContainer } from '@/lib/overlay'

/** How long Copy link says "Link copied": long enough to read after glancing away and back. */
const COPIED_MS = 2500

const copyCaption = tv({
  base: 'text-center text-xs text-gray-11 select-all',
  variants: { wrap: { true: 'break-all', false: 'truncate' } },
})

// The button itself changes, under the visitor's thumb, so the answer is where they are already
// looking. The raw URL stays below as a caption, to show what is shared and to select by
// hand where a host page refuses the clipboard.
function CopyLinkButton({ url }: { url: string }) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()
  const { copied, copy } = useCopy(COPIED_MS)
  const [failed, setFailed] = useState(false)
  const captionRef = useRef<HTMLParagraphElement>(null)
  const status = copied ? t('share.link_copied') : ''

  const onClick = async () => {
    const ok = await copy(url)

    setFailed(!ok)
    // A host's Permissions-Policy, or a page that is not https, refuses the clipboard. The link
    // is selected instead, which the hint below names.
    if (!ok && captionRef.current) window.getSelection()?.selectAllChildren(captionRef.current)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full"
        color="primary"
        size="lg"
        variant={copied ? 'flat' : 'bordered'}
        onClick={() => void onClick()}
      >
        {copied ? <Check aria-hidden size={18} strokeWidth={3} /> : <Link aria-hidden size={18} />}
        {status || t('share.copy_link')}
      </Button>
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
      {failed && (
        <p className="text-sm text-danger-11" role="alert">
          {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
        </p>
      )}
      <p ref={captionRef} className={copyCaption({ wrap: failed })} title={url}>
        {url}
      </p>
    </div>
  )
}

/**
 * Share, as one button. It opens the device's own share sheet, which lists the apps this person
 * uses. Where there is none (most desktop browsers), or a host page refuses it, the same button
 * opens the region's share targets in a popover instead.
 */
function ShareButton({ label, url, country }: ShareContentProps) {
  const { t } = useTranslation()
  const { canShare, share } = useWebShare()
  const [open, setOpen] = useState(false)

  const onClick = async (event: MouseEvent) => {
    // With the popover already open, the click is Radix's own toggle, which closes it.
    if (!canShare || open) return

    // Before the await: Radix reads it as soon as this handler returns, and skips its own toggle.
    event.preventDefault()
    if ((await share({ title: label, url })) === 'unavailable') setOpen(true)
  }

  // A pick hands over to the network's page or the mail app, so the popover goes with it.
  const closeOnPick = (event: MouseEvent) => {
    if ((event.target as Element).closest('button')) setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button className="w-full" color="primary" size="lg" variant="solid" onClick={onClick}>
          <Share aria-hidden size={18} />
          {t('share.native')}
        </Button>
      </Popover.Trigger>

      <Popover.Portal container={overlayContainer()}>
        {/* As wide as one row of targets, which can be wider than a narrow side panel's button.
            Only a screen too narrow for the row wraps it. */}
        <Popover.Content
          aria-label={t('share.native')}
          className={panelChrome({
            class: 'max-w-[var(--radix-popover-content-available-width)] p-3',
          })}
          sideOffset={8}
          {...frameCollision()}
          onClick={closeOnPick}
        >
          <ShareTargets country={country} title={label} url={url} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export type ShareContentProps = {
  label: string
  url: string
  /**
   * The viewer's country (ISO alpha-2). It picks and orders the share targets to their region
   * (`platformsForCountry`). The consumer resolves it, through `useViewerCountry`, so this
   * molecule stays pure and SSR-testable. When absent, this uses the default platform set.
   */
  country?: string
}

/**
 * The one share block, on the class's Share panel and on the registration confirmation: Share
 * (the device's own sheet, or the region's targets in a popover), then Copy link.
 *
 * `label` and `url` pass through raw. react-share and the native sheet encode their own
 * parameters, so an `encodeURI` here would double-encode them.
 */
export function ShareContent({ label, url, country }: ShareContentProps) {
  return (
    <div className="flex flex-col gap-3">
      <ShareButton country={country} label={label} url={url} />
      <CopyLinkButton url={url} />
    </div>
  )
}
