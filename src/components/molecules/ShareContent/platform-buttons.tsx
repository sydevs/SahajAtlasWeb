import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EmailIcon,
  EmailShareButton,
  FacebookIcon,
  FacebookShareButton,
  LineIcon,
  LineShareButton,
  LinkedinIcon,
  LinkedinShareButton,
  OKIcon,
  OKShareButton,
  RedditIcon,
  RedditShareButton,
  TelegramIcon,
  TelegramShareButton,
  ViberIcon,
  ViberShareButton,
  VKIcon,
  VKShareButton,
  WeiboIcon,
  WeiboShareButton,
  WhatsappIcon,
  WhatsappShareButton,
  XIcon,
  XShareButton,
} from 'react-share'

import { type PlatformKey, platformsForCountry } from '@/lib/share/platforms'

// Each network in its own brand colours, the way a phone's share sheet shows them: a person
// finds their app by its colour before its glyph.
const ICON_PROPS = { round: true, size: 44 }

// The disc is the button, so the focus line follows it round. In dark mode a hairline keeps a
// dark disc (X's black) from melting into the panel.
const BUTTON_CLASS = 'rounded-full dark:ring-1 dark:ring-white/20'

type RenderArgs = { url: string; title: string; ariaLabel: string; className: string }

// Each platform maps to its display name, for the aria-label, and a
// render that wires the matching react-share button and round icon. This
// renders per-entry, instead of through one generic component, because
// the networks' props differ. Facebook carries no share text, since it
// reads the shared page's Open Graph tags. Email maps the event title to
// the mail subject, and its body defaults to the URL. Every other
// network takes the title as the composer's prefilled text.
const PLATFORMS: Record<PlatformKey, { name: string; render: (args: RenderArgs) => ReactNode }> = {
  whatsapp: {
    name: 'WhatsApp',
    render: ({ url, title, ariaLabel, className }) => (
      <WhatsappShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <WhatsappIcon {...ICON_PROPS} />
      </WhatsappShareButton>
    ),
  },
  telegram: {
    name: 'Telegram',
    render: ({ url, title, ariaLabel, className }) => (
      <TelegramShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <TelegramIcon {...ICON_PROPS} />
      </TelegramShareButton>
    ),
  },
  facebook: {
    name: 'Facebook',
    render: ({ url, ariaLabel, className }) => (
      <FacebookShareButton aria-label={ariaLabel} className={className} url={url}>
        <FacebookIcon {...ICON_PROPS} />
      </FacebookShareButton>
    ),
  },
  x: {
    name: 'X',
    render: ({ url, title, ariaLabel, className }) => (
      <XShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <XIcon {...ICON_PROPS} />
      </XShareButton>
    ),
  },
  linkedin: {
    name: 'LinkedIn',
    render: ({ url, title, ariaLabel, className }) => (
      <LinkedinShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <LinkedinIcon {...ICON_PROPS} />
      </LinkedinShareButton>
    ),
  },
  reddit: {
    name: 'Reddit',
    render: ({ url, title, ariaLabel, className }) => (
      <RedditShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <RedditIcon {...ICON_PROPS} />
      </RedditShareButton>
    ),
  },
  email: {
    name: 'Email',
    render: ({ url, title, ariaLabel, className }) => (
      <EmailShareButton aria-label={ariaLabel} className={className} subject={title} url={url}>
        <EmailIcon {...ICON_PROPS} />
      </EmailShareButton>
    ),
  },
  vk: {
    name: 'VK',
    render: ({ url, title, ariaLabel, className }) => (
      <VKShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <VKIcon {...ICON_PROPS} />
      </VKShareButton>
    ),
  },
  ok: {
    name: 'OK.ru',
    render: ({ url, title, ariaLabel, className }) => (
      <OKShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <OKIcon {...ICON_PROPS} />
      </OKShareButton>
    ),
  },
  line: {
    name: 'LINE',
    render: ({ url, title, ariaLabel, className }) => (
      <LineShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <LineIcon {...ICON_PROPS} />
      </LineShareButton>
    ),
  },
  viber: {
    name: 'Viber',
    render: ({ url, title, ariaLabel, className }) => (
      <ViberShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <ViberIcon {...ICON_PROPS} />
      </ViberShareButton>
    ),
  },
  weibo: {
    name: 'Weibo',
    render: ({ url, title, ariaLabel, className }) => (
      <WeiboShareButton aria-label={ariaLabel} className={className} title={title} url={url}>
        <WeiboIcon {...ICON_PROPS} />
      </WeiboShareButton>
    ),
  },
}

export type PlatformButtonProps = {
  platform: PlatformKey
  /** The canonical event URL to share. */
  url: string
  /** The event title. This is the composer's prefilled text, and the mail subject for Email. */
  title: string
}

/**
 * One region-appropriate share target: the react-share button and round
 * icon for `platform`, labelled "Share on <platform>" for screen
 * readers. `ShareTargets` lays these out, ordered by `platformsForCountry`.
 */
export function PlatformButton({ platform, url, title }: PlatformButtonProps) {
  const { t } = useTranslation()
  const { name, render } = PLATFORMS[platform]

  return render({
    url,
    title,
    ariaLabel: t('share.share_on', { platform: name }),
    className: BUTTON_CLASS,
  })
}

export type ShareTargetsProps = {
  url: string
  title: string
  /** The viewer's country (ISO alpha-2), which picks and orders the targets. */
  country?: string
}

/**
 * The region's share targets in one wrapping row: what the Share button offers where the device
 * has no share sheet of its own.
 */
export function ShareTargets({ url, title, country }: ShareTargetsProps) {
  return (
    <div className="flex flex-row flex-wrap justify-center gap-2">
      {platformsForCountry(country).map((platform) => (
        <PlatformButton key={platform} platform={platform} title={title} url={url} />
      ))}
    </div>
  )
}
