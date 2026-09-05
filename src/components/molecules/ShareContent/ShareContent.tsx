import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tv } from 'tailwind-variants'
import { Share } from 'lucide-react'

import { PlatformButton } from './platform-buttons'

import { Button } from '@/components/atoms/Button'
import { useWebShare } from '@/hooks/use-web-share'
import { platformsForCountry } from '@/lib/share/platforms'

const copyField = tv({
  base: 'w-full select-all truncate rounded px-3 py-2 text-start text-sm text-secondary-11 transition-colors',
  variants: { copied: { true: 'bg-secondary-5', false: 'bg-secondary-3' } },
  defaultVariants: { copied: false },
})

// A click-to-copy value field. It copies on click, with a brief tint
// flash. The text stays selectable as a fallback. This is exported for
// the event panel's desktop contact popover (issue #52).
export function CopyField({ value }: { value: string }) {
  const { t } = useTranslation('common')
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
 * The shareable block: a click-to-copy URL field, plus regionally-ordered
 * share targets. On a device that supports the Web Share API, it leads
 * with a single "Share…" button, opening the native OS sheet, which
 * surfaces the viewer's own installed apps, the ultimate region filter.
 * Everywhere else, or if that native call is blocked, it falls back to a
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
  // This reveals the grid when there is no native sheet, or after a
  // native attempt is blocked (host Permissions-Policy) or dismissed. So
  // the viewer is never stranded.
  const [gridRevealed, setGridRevealed] = useState(false)
  const showGrid = !canShare || gridRevealed

  const platforms = platformsForCountry(country)

  const shareNatively = async () => {
    if (!(await share({ title: label, url }))) setGridRevealed(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <CopyField value={url} />

      {showGrid ? (
        <div className="flex flex-row flex-wrap justify-center gap-3">
          {platforms.map((platform) => (
            <PlatformButton key={platform} platform={platform} title={label} url={url} />
          ))}
        </div>
      ) : (
        <Button className="w-full" color="primary" variant="solid" onClick={shareNatively}>
          <Share size={18} />
          {t('share.native')}
        </Button>
      )}
    </div>
  )
}
