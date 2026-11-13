import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tv } from 'tailwind-variants'
import * as Popover from '@radix-ui/react-popover'
import { Check, Link, Share } from 'lucide-react'

import { ShareTargets } from './platform-buttons'

import { Button } from '@/components/atoms/Button'
import { panelChrome } from '@/components/atoms/Select'
import { CopyFallback } from '@/components/molecules/CopyFallback'
import { QrPoster } from '@/components/molecules/QrPoster'
import { useWebShare } from '@/hooks/use-web-share'
import { frameCollision, overlayContainer } from '@/lib/overlay'

const copyField = tv({
  base: 'w-full truncate rounded px-3 py-2 text-start text-sm text-secondary-11 transition-colors select-all',
  variants: { copied: { true: 'bg-secondary-5', false: 'bg-secondary-3' } },
  defaultVariants: { copied: false },
})

export type CopyFieldProps = {
  value: string
  /** The button's name, saying what it copies and containing the value it shows: "Copy phone
   *  number 020 7946 0000". A generic "Copy link" over a phone number named the wrong thing. */
  label: string
  /** What the live region announces once it has copied: "Phone number copied". */
  copiedLabel: string
}

// A click-to-copy value field. It copies on click, with a brief tint
// flash. The text stays selectable as a fallback. This is exported for
// the event panel's desktop contact popover (issue #52).
export function CopyField({ value, label, copiedLabel }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        aria-label={label}
        className={copyField({ copied })}
        title={value}
        type="button"
        onClick={copy}
      >
        {value}
      </button>
      {/* Success was previously signalled ONLY by a secondary-3 to
          secondary-5 tint, a roughly 1.15:1 shift. A screen reader cannot
          see that at all, and low-vision or monochrome users would not
          perceive it either. The live region announces success, and the
          text confirms it. */}
      <span aria-live="polite" className="h-4 text-xs text-secondary-11">
        {copied ? copiedLabel : ''}
      </span>
    </div>
  )
}

/** How long the button holds "Link copied". Long enough to read at a glance away and back. */
const COPIED_MS = 2500

// The copy control: a real button that says what it does, and says "Link copied" when it has.
// The button itself changes, under the visitor's thumb, so the answer is where they are already
// looking. The raw URL stays below as a quiet caption, to see what is being shared, and where a
// host page blocks the clipboard `CopyFallback` takes its place.
function CopyLinkButton({ url }: { url: string }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Each refusal remounts the fallback, which selects the link again and repeats its alert.
  const [refusals, setRefusals] = useState(0)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    window.clearTimeout(timer.current)

    try {
      await navigator.clipboard.writeText(url)
      setStatus('copied')
      timer.current = window.setTimeout(() => setStatus('idle'), COPIED_MS)
    } catch {
      setStatus('failed')
      setRefusals((count) => count + 1)
    }
  }

  const copied = status === 'copied'

  return (
    <div className="flex flex-col gap-2">
      {/* The darker teal of the Register button, as text: Copy link's own teal measured 3:1. */}
      <Button
        className="w-full text-primary-12"
        color="primary"
        size="lg"
        variant={copied ? 'flat' : 'bordered'}
        onClick={copy}
      >
        {copied ? <Check aria-hidden size={18} strokeWidth={3} /> : <Link aria-hidden size={18} />}
        <span aria-live="polite">{copied ? t('share.link_copied') : t('share.copy_link')}</span>
      </Button>
      {status === 'failed' ? (
        <CopyFallback key={refusals} url={url} />
      ) : (
        <p className="truncate text-center text-xs text-gray-11 select-all" title={url}>
          {url}
        </p>
      )}
    </div>
  )
}

type ShareButtonProps = { label: string; url: string; country?: string }

/**
 * Share, as one button. It opens the device's own share sheet, which lists the apps this person
 * uses. Where there is none (most desktop browsers), or a host page refuses it, the same button
 * opens the region's share targets in a popover instead, so the fallback takes the sheet's place
 * rather than stacking below the other buttons.
 */
function ShareButton({ label, url, country }: ShareButtonProps) {
  const { t } = useTranslation()
  const { canShare, share } = useWebShare()
  const [open, setOpen] = useState(false)

  const onClick = async (event: MouseEvent) => {
    if (!canShare) return

    // Before the await: Radix reads it right after this returns, and skips its own toggle.
    event.preventDefault()
    // Backing out of the sheet is not a failure: the button stays, ready to try again.
    if ((await share({ title: label, url })) === 'unavailable') setOpen(true)
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
        {/* As wide as one row of targets, which can be wider than a narrow side panel's button;
            only a screen too narrow for the row wraps it. A pick hands over to the network's own
            page or the mail app, so the popover goes. */}
        <Popover.Content
          aria-label={t('share.native')}
          className={panelChrome({
            class: 'max-w-[var(--radix-popover-content-available-width)] p-3',
          })}
          sideOffset={8}
          {...frameCollision()}
          onClick={() => setOpen(false)}
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
  /** Adds the QR code for posters. The class's own Share panel offers it; a registrant does not
   *  need one to invite a friend. */
  qr?: boolean
  /** Told when the QR row opens, so a bottom sheet can make room for the code. */
  onQrOpen?: () => void
}

/**
 * The one share block, on the class's Share panel and on the registration confirmation: Share
 * (the device's sheet, or the region's targets in a popover), then Copy link, then, on the Share
 * panel only, the QR code.
 *
 * `label` and `url` pass through raw. react-share and the native sheet encode their own
 * parameters, so an `encodeURI` here would double-encode them.
 */
export function ShareContent({ label, url, country, qr = false, onQrOpen }: ShareContentProps) {
  return (
    <div className="flex flex-col gap-3">
      <ShareButton country={country} label={label} url={url} />
      <CopyLinkButton url={url} />
      {qr && <QrPoster label={label} url={url} onOpen={onQrOpen} />}
    </div>
  )
}
