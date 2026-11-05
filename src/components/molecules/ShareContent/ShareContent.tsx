import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tv } from 'tailwind-variants'
import { Check, Link, Share } from 'lucide-react'
import clsx from 'clsx'

import { PlatformButton } from './platform-buttons'

import { Button } from '@/components/atoms/Button'
import { useCoarsePointer } from '@/config/responsive'
import { useWebShare } from '@/hooks/use-web-share'
import { platformsForCountry } from '@/lib/share/platforms'

const copyField = tv({
  base: 'w-full truncate rounded px-3 py-2 text-start text-sm text-secondary-11 transition-colors select-all',
  variants: { copied: { true: 'bg-secondary-5', false: 'bg-secondary-3' } },
  defaultVariants: { copied: false },
})

// A click-to-copy value field. It copies on click, with a brief tint
// flash. The text stays selectable as a fallback. This is exported for
// the event panel's desktop contact popover (issue #52).
export function CopyField({ value }: { value: string }) {
  const { t } = useTranslation()
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
        aria-label={t('share.copy_link')}
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
        {copied ? t('share.copied') : ''}
      </span>
    </div>
  )
}

/** How long the button holds "Link copied". Long enough to read at a glance away and back. */
const COPIED_MS = 2500

/** The darker teal of the Register button, as text: Copy link's own teal measured about 3:1. */
const READABLE_PRIMARY = 'text-primary-12'

// The share view's copy control: a real button that says what it does, and says "Link copied"
// when it has. The button itself changes, under the visitor's thumb, so the answer is where they
// are already looking. The raw URL stays below as a quiet caption, to see what is being shared
// and to select by hand where a host page blocks the clipboard.
function CopyLinkButton({ url, solid }: { url: string; solid: boolean }) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const captionRef = useRef<HTMLParagraphElement>(null)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    window.clearTimeout(timer.current)

    try {
      await navigator.clipboard.writeText(url)
      setStatus('copied')
      timer.current = window.setTimeout(() => setStatus('idle'), COPIED_MS)
    } catch {
      // A host's Permissions-Policy, or a page that is not https, refuses the clipboard. So
      // this says so and selects the link, rather than a tap that appears to do nothing.
      setStatus('failed')
      if (captionRef.current) window.getSelection()?.selectAllChildren(captionRef.current)
    }
  }

  const copied = status === 'copied'

  return (
    <div className="flex flex-col gap-2">
      <Button
        className={clsx('w-full', (copied || !solid) && READABLE_PRIMARY)}
        color="primary"
        size="lg"
        variant={copied ? 'flat' : solid ? 'solid' : 'bordered'}
        onClick={copy}
      >
        {copied ? <Check aria-hidden size={18} strokeWidth={3} /> : <Link aria-hidden size={18} />}
        <span aria-live="polite">{copied ? t('share.link_copied') : t('share.copy_link')}</span>
      </Button>
      {status === 'failed' && (
        <p className="text-sm text-danger-11" role="alert">
          {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
        </p>
      )}
      <p ref={captionRef} className={copyCaption({ wrap: status === 'failed' })} title={url}>
        {url}
      </p>
    </div>
  )
}

const copyCaption = tv({
  base: 'text-center text-xs text-gray-11 select-all',
  variants: { wrap: { true: 'break-all', false: 'truncate' } },
})

export type ShareContentProps = {
  label: string
  url: string
  /**
   * The viewer's country (ISO alpha-2). It orders the share grid to their
   * region (`platformsForCountry`). The consumer resolves it, through
   * `useViewerCountry`, so this molecule stays pure and SSR-testable. When
   * absent, this uses the default platform set.
   */
  country?: string
}

/**
 * The shareable block: a Copy link button, plus regionally-ordered
 * share targets. On a device that supports the Web Share API, it leads
 * with a single "Share…" button, opening the native OS sheet, which
 * surfaces the viewer's own installed apps, the ultimate region filter.
 * Everywhere else, or if that native sheet cannot open, it falls back to a
 * grid of `react-share` buttons ordered by `country`. This is generic
 * (label, url, and optional country). The event share drawer (ShareView)
 * and the registration "thank you" screen both use it.
 *
 * `label` and `url` pass through raw. react-share and the native sheet
 * encode their own parameters, so the old `encodeURI` here would have
 * double-encoded them.
 */
export function ShareContent({ label, url, country }: ShareContentProps) {
  const { t } = useTranslation()
  const { canShare, share } = useWebShare()
  // This reveals the grid when there is no native sheet, or after a native attempt is blocked
  // (host Permissions-Policy). So the viewer is never stranded. Backing out of the sheet is not
  // that: the button stays where it was, ready to try again.
  const [gridRevealed, setGridRevealed] = useState(false)
  const showGrid = !canShare || gridRevealed

  const platforms = platformsForCountry(country)

  const shareNatively = async () => {
    if ((await share({ title: label, url })) === 'unavailable') setGridRevealed(true)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The phone's own sheet leads where there is one: it lists the apps this person uses. */}
      {!showGrid && (
        <Button
          className="w-full"
          color="primary"
          size="lg"
          variant="solid"
          onClick={shareNatively}
        >
          <Share aria-hidden size={18} />
          {t('share.native')}
        </Button>
      )}

      <CopyLinkButton solid={showGrid} url={url} />

      {showGrid && (
        <div className="flex flex-row flex-wrap justify-center gap-2 pt-1">
          {platforms.map((platform) => (
            <PlatformButton key={platform} platform={platform} title={label} url={url} />
          ))}
        </div>
      )}
    </div>
  )
}
