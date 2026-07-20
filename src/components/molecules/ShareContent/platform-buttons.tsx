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

import { type PlatformKey } from '@/lib/share/platforms'

const ICON_SIZE = 40

type RenderArgs = { url: string; title: string; ariaLabel: string }

// Each platform → its display name (for the aria-label) and a render that wires
// the matching react-share button + round icon. Rendered per-entry rather than
// through one generic component because the networks' props differ: Facebook
// carries no share text (it reads the shared page's Open Graph tags), Email maps
// the event title to the mail subject (its body defaults to the URL), and every
// other network takes the title as the composer's prefilled text.
const PLATFORMS: Record<PlatformKey, { name: string; render: (args: RenderArgs) => ReactNode }> = {
  whatsapp: {
    name: 'WhatsApp',
    render: ({ url, title, ariaLabel }) => (
      <WhatsappShareButton aria-label={ariaLabel} title={title} url={url}>
        <WhatsappIcon round size={ICON_SIZE} />
      </WhatsappShareButton>
    ),
  },
  telegram: {
    name: 'Telegram',
    render: ({ url, title, ariaLabel }) => (
      <TelegramShareButton aria-label={ariaLabel} title={title} url={url}>
        <TelegramIcon round size={ICON_SIZE} />
      </TelegramShareButton>
    ),
  },
  facebook: {
    name: 'Facebook',
    render: ({ url, ariaLabel }) => (
      <FacebookShareButton aria-label={ariaLabel} url={url}>
        <FacebookIcon round size={ICON_SIZE} />
      </FacebookShareButton>
    ),
  },
  x: {
    name: 'X',
    render: ({ url, title, ariaLabel }) => (
      <XShareButton aria-label={ariaLabel} title={title} url={url}>
        <XIcon round size={ICON_SIZE} />
      </XShareButton>
    ),
  },
  linkedin: {
    name: 'LinkedIn',
    render: ({ url, title, ariaLabel }) => (
      <LinkedinShareButton aria-label={ariaLabel} title={title} url={url}>
        <LinkedinIcon round size={ICON_SIZE} />
      </LinkedinShareButton>
    ),
  },
  reddit: {
    name: 'Reddit',
    render: ({ url, title, ariaLabel }) => (
      <RedditShareButton aria-label={ariaLabel} title={title} url={url}>
        <RedditIcon round size={ICON_SIZE} />
      </RedditShareButton>
    ),
  },
  email: {
    name: 'Email',
    render: ({ url, title, ariaLabel }) => (
      <EmailShareButton aria-label={ariaLabel} subject={title} url={url}>
        <EmailIcon round size={ICON_SIZE} />
      </EmailShareButton>
    ),
  },
  vk: {
    name: 'VK',
    render: ({ url, title, ariaLabel }) => (
      <VKShareButton aria-label={ariaLabel} title={title} url={url}>
        <VKIcon round size={ICON_SIZE} />
      </VKShareButton>
    ),
  },
  ok: {
    name: 'OK.ru',
    render: ({ url, title, ariaLabel }) => (
      <OKShareButton aria-label={ariaLabel} title={title} url={url}>
        <OKIcon round size={ICON_SIZE} />
      </OKShareButton>
    ),
  },
  line: {
    name: 'LINE',
    render: ({ url, title, ariaLabel }) => (
      <LineShareButton aria-label={ariaLabel} title={title} url={url}>
        <LineIcon round size={ICON_SIZE} />
      </LineShareButton>
    ),
  },
  viber: {
    name: 'Viber',
    render: ({ url, title, ariaLabel }) => (
      <ViberShareButton aria-label={ariaLabel} title={title} url={url}>
        <ViberIcon round size={ICON_SIZE} />
      </ViberShareButton>
    ),
  },
  weibo: {
    name: 'Weibo',
    render: ({ url, title, ariaLabel }) => (
      <WeiboShareButton aria-label={ariaLabel} title={title} url={url}>
        <WeiboIcon round size={ICON_SIZE} />
      </WeiboShareButton>
    ),
  },
}

export type PlatformButtonProps = {
  platform: PlatformKey
  /** The canonical event URL to share. */
  url: string
  /** The event title — the composer's prefilled text (mail subject for Email). */
  title: string
}

/**
 * One region-appropriate share target: the react-share button + round icon for
 * `platform`, labelled "Share on <platform>" for screen readers. The parent
 * `ShareContent` lays these out in a grid ordered by `platformsForCountry`.
 */
export function PlatformButton({ platform, url, title }: PlatformButtonProps) {
  const { t } = useTranslation()
  const { name, render } = PLATFORMS[platform]

  return render({ url, title, ariaLabel: t('share.share_on', { platform: name }) })
}
