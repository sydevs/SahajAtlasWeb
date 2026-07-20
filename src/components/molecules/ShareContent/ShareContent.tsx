import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PlatformButton } from './platform-buttons'

import { Button } from '@/components/atoms/Button'
import { ShareIcon } from '@/components/atoms/Icons'
import { useWebShare } from '@/hooks/use-web-share'
import { platformsForCountry } from '@/lib/share/platforms'

// Click-to-copy URL field — the custom replacement for NextUI's Snippet (which
// was rendered with hideSymbol, i.e. select-to-copy). Copies on click with a
// brief tint flash; the text stays selectable as a fallback.
function CopyField({ value }: { value: string }) {
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
    <button
      aria-label="Copy link"
      className={`w-full select-all truncate rounded px-3 py-2 text-left text-sm text-secondary-11 transition-colors ${
        copied ? 'bg-secondary-5' : 'bg-secondary-3'
      }`}
      title={value}
      type="button"
      onClick={copy}
    >
      {value}
    </button>
  )
}

export type ShareContentProps = {
  label: string
  url: string
  /**
   * The viewer's country (ISO alpha-2) — orders the share grid to their region
   * (`platformsForCountry`). Resolved by the consumer (via `useViewerCountry`) so
   * this molecule stays pure and SSR-testable. Absent → the default platform set.
   */
  country?: string
}

/**
 * The shareable block: a click-to-copy URL field plus regionally-ordered share
 * targets. On a device that supports the Web Share API it leads with a single
 * "Share…" button opening the native OS sheet (which surfaces the viewer's own
 * installed apps — the ultimate region filter); everywhere else, or if that
 * native call is blocked, it falls back to a grid of `react-share` buttons
 * ordered by `country`. Generic (label + url + optional country): used by the
 * event share drawer (ShareView) and the registration "thank you" screen.
 *
 * `label`/`url` are passed through raw — react-share and the native sheet encode
 * their own parameters, so the old `encodeURI` here would have double-encoded.
 */
export function ShareContent({ label, url, country }: ShareContentProps) {
  const { t } = useTranslation()
  const { canShare, share } = useWebShare()
  // Reveal the grid when there's no native sheet, or after a native attempt is
  // blocked (host Permissions-Policy) or dismissed — the viewer is never stranded.
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
        <Button
          className="w-full"
          color="primary"
          startContent={<ShareIcon size={18} />}
          variant="solid"
          onClick={shareNatively}
        >
          {t('share.native')}
        </Button>
      )}
    </div>
  )
}
