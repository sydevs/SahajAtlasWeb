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

// 44px, not a smaller round icon: react-share sizes its button to the icon, so this IS the tap
// target (#432). Each network keeps its own brand colours, as a phone's share sheet shows them:
// a person finds their app by its colour before its glyph.
const ICON_PROPS = { round: true, size: 44 }

// react-share writes `outline-offset: 2px` inline, which would push `focus-ring`'s outline off the
// disc; `undefined` drops that one declaration and keeps the rest of its reset.
const RESET_STYLE = { outlineOffset: undefined }

const BUTTON_CLASS = 'focus-ring'

// X's disc is black, so in dark mode a hairline keeps it from melting into the panel.
const X_CLASS = `${BUTTON_CLASS} dark:ring-1 dark:ring-white/20`

type RenderArgs = { url: string; title: string; ariaLabel: string }

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
    render: ({ url, title, ariaLabel }) => (
      <WhatsappShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <WhatsappIcon {...ICON_PROPS} />
      </WhatsappShareButton>
    ),
  },
  telegram: {
    name: 'Telegram',
    render: ({ url, title, ariaLabel }) => (
      <TelegramShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <TelegramIcon {...ICON_PROPS} />
      </TelegramShareButton>
    ),
  },
  facebook: {
    name: 'Facebook',
    render: ({ url, ariaLabel }) => (
      <FacebookShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        url={url}
      >
        <FacebookIcon {...ICON_PROPS} />
      </FacebookShareButton>
    ),
  },
  x: {
    name: 'X',
    render: ({ url, title, ariaLabel }) => (
      <XShareButton
        aria-label={ariaLabel}
        className={X_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <XIcon {...ICON_PROPS} />
      </XShareButton>
    ),
  },
  linkedin: {
    name: 'LinkedIn',
    render: ({ url, title, ariaLabel }) => (
      <LinkedinShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <LinkedinIcon {...ICON_PROPS} />
      </LinkedinShareButton>
    ),
  },
  reddit: {
    name: 'Reddit',
    render: ({ url, title, ariaLabel }) => (
      <RedditShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <RedditIcon {...ICON_PROPS} />
      </RedditShareButton>
    ),
  },
  email: {
    name: 'Email',
    render: ({ url, title, ariaLabel }) => (
      <EmailShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        subject={title}
        url={url}
      >
        <EmailIcon {...ICON_PROPS} />
      </EmailShareButton>
    ),
  },
  vk: {
    name: 'VK',
    render: ({ url, title, ariaLabel }) => (
      <VKShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <VKIcon {...ICON_PROPS} />
      </VKShareButton>
    ),
  },
  ok: {
    name: 'OK.ru',
    render: ({ url, title, ariaLabel }) => (
      <OKShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <OKIcon {...ICON_PROPS} />
      </OKShareButton>
    ),
  },
  line: {
    name: 'LINE',
    render: ({ url, title, ariaLabel }) => (
      <LineShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <LineIcon {...ICON_PROPS} />
      </LineShareButton>
    ),
  },
  viber: {
    name: 'Viber',
    render: ({ url, title, ariaLabel }) => (
      <ViberShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
        <ViberIcon {...ICON_PROPS} />
      </ViberShareButton>
    ),
  },
  weibo: {
    name: 'Weibo',
    render: ({ url, title, ariaLabel }) => (
      <WeiboShareButton
        aria-label={ariaLabel}
        className={BUTTON_CLASS}
        style={RESET_STYLE}
        title={title}
        url={url}
      >
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

  return render({ url, title, ariaLabel: t('share.a11y.share_on', { platform: name }) })
}

export type ShareTargetsProps = {
  url: string
  title: string
  /** The viewer's country (ISO alpha-2), which picks and orders the targets. */
  country?: string
}

/**
 * The region's share targets in one wrapping row, icons only: the networks' names are English
 * words in code, so a visible "Email" would show untranslated. This is what the Share button
 * offers where the device has no share sheet of its own.
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
