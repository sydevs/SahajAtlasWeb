import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tv } from 'tailwind-variants'

import { Link } from '@/components/atoms/Link'
import {
  FacebookIcon,
  EmailIcon,
  LinkedinIcon,
  TwitterIcon,
  FlipboardIcon,
} from '@/components/atoms/Icons'

const copyField = tv({
  base: 'w-full select-all truncate rounded px-3 py-2 text-start text-sm text-secondary-11 transition-colors',
  variants: { copied: { true: 'bg-secondary-5', false: 'bg-secondary-3' } },
  defaultVariants: { copied: false },
})

// Click-to-copy value field. Copies on click
// with a brief tint flash; the text stays selectable as a fallback. Exported
// for the event panel's desktop contact popover (issue #52).
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
      {/* Success was previously signalled ONLY by a secondary-3 → secondary-5
          tint — a ~1.15:1 shift that a screen reader can't see at all and that
          low-vision/monochrome users won't perceive either. The live region
          announces it and the text confirms it. */}
      <span aria-live="polite" className="h-4 text-xs text-secondary-11">
        {copied ? t('share.copied') : ''}
      </span>
    </div>
  )
}

export type ShareContentProps = {
  label: string
  url: string
}

/**
 * The shareable block: a click-to-copy URL field plus a row of social share
 * links. Generic (label + url) — used both in the event share dialog (composed
 * by EventView) and the registration "thank you" screen.
 */
export function ShareContent({ label, url }: ShareContentProps) {
  label = encodeURI(label)
  url = encodeURI(url)
  const socials = [
    {
      url: `mailto:?subject=${label}&body=${url}`,
      icon: EmailIcon,
    },
    {
      url: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      icon: FacebookIcon,
    },
    {
      url: `https://x.com/intent/tweet?text=${url}`,
      icon: TwitterIcon,
    },
    {
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      icon: LinkedinIcon,
    },
    {
      url: `https://share.flipboard.com/bookmarklet/popout?v=2&title=${label}&url=${url}`,
      icon: FlipboardIcon,
    },
  ]

  return (
    <>
      <div>
        <CopyField value={url} />
      </div>
      <div className="flex flex-row gap-4 mt-2 justify-center">
        {socials.map((social, index) => (
          <Link key={index} href={social.url} rel="noopener noreferrer" target="_blank">
            <social.icon size={36} />
          </Link>
        ))}
      </div>
    </>
  )
}
