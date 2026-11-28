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

import { ROW_TARGET_CLASS, TARGET_CLASS } from './target'

import { type PlatformKey, platformsForCountry } from '@/lib/share/platforms'

// 44px, not a smaller round icon: react-share sizes its button to the icon, so this IS the tap
// target (#432). Each network keeps its own brand colours, as a phone's share sheet shows them:
// a person finds their app by its colour before its glyph.
const ICON_PROPS = { round: true, size: 44 }

type IconComponent = (props: typeof ICON_PROPS & { className?: string }) => ReactNode

/** What every network's button takes alike, built once by `PlatformButton`. */
type ButtonProps = {
  'aria-label': string
  className: string
  resetButtonStyle: false
  beforeOnClick?: () => void
  children: ReactNode
}

type RenderArgs = { url: string; title: string; button: ButtonProps }

// Each platform maps to its display name, its round icon, and a render that wires the matching
// react-share button. This renders per-entry, instead of through one generic component, because
// the networks' props differ. Facebook carries no share text, since it reads the shared page's
// Open Graph tags. Email maps the event title to the mail subject, and its body defaults to the
// URL. Every other network takes the title as the composer's prefilled text.
const PLATFORMS: Record<
  PlatformKey,
  {
    name: string
    Icon: IconComponent
    /** X's disc is black, so in dark mode a hairline keeps it from melting into the panel. */
    iconClass?: string
    render: (args: RenderArgs) => ReactNode
  }
> = {
  whatsapp: {
    name: 'WhatsApp',
    Icon: WhatsappIcon,
    render: ({ url, title, button }) => <WhatsappShareButton {...button} title={title} url={url} />,
  },
  telegram: {
    name: 'Telegram',
    Icon: TelegramIcon,
    render: ({ url, title, button }) => <TelegramShareButton {...button} title={title} url={url} />,
  },
  facebook: {
    name: 'Facebook',
    Icon: FacebookIcon,
    render: ({ url, button }) => <FacebookShareButton {...button} url={url} />,
  },
  x: {
    name: 'X',
    Icon: XIcon,
    iconClass: 'dark:rounded-full dark:ring-1 dark:ring-white/20',
    render: ({ url, title, button }) => <XShareButton {...button} title={title} url={url} />,
  },
  linkedin: {
    name: 'LinkedIn',
    Icon: LinkedinIcon,
    render: ({ url, title, button }) => <LinkedinShareButton {...button} title={title} url={url} />,
  },
  reddit: {
    name: 'Reddit',
    Icon: RedditIcon,
    render: ({ url, title, button }) => <RedditShareButton {...button} title={title} url={url} />,
  },
  email: {
    name: 'Email',
    Icon: EmailIcon,
    render: ({ url, title, button }) => <EmailShareButton {...button} subject={title} url={url} />,
  },
  vk: {
    name: 'VK',
    Icon: VKIcon,
    render: ({ url, title, button }) => <VKShareButton {...button} title={title} url={url} />,
  },
  ok: {
    name: 'OK.ru',
    Icon: OKIcon,
    render: ({ url, title, button }) => <OKShareButton {...button} title={title} url={url} />,
  },
  line: {
    name: 'LINE',
    Icon: LineIcon,
    render: ({ url, title, button }) => <LineShareButton {...button} title={title} url={url} />,
  },
  viber: {
    name: 'Viber',
    Icon: ViberIcon,
    render: ({ url, title, button }) => <ViberShareButton {...button} title={title} url={url} />,
  },
  weibo: {
    name: 'Weibo',
    Icon: WeiboIcon,
    render: ({ url, title, button }) => <WeiboShareButton {...button} title={title} url={url} />,
  },
}

export type PlatformButtonProps = {
  platform: PlatformKey
  /** The canonical event URL to share. */
  url: string
  /** The event title. This is the composer's prefilled text, and the mail subject for Email. */
  title: string
  /** Called as the network's page or the mail app takes over. */
  onPick?: () => void
  /** The share row's larger look (`ShareRow`), rather than a menu's. */
  row?: boolean
}

/**
 * One region-appropriate share target: the react-share button, its round icon and the network's
 * name below it. Brand names stay as written in every language; Email is the one generic name,
 * so it takes translated copy, in the accessible name too (WCAG 2.5.3).
 */
export function PlatformButton({ platform, url, title, onPick, row = false }: PlatformButtonProps) {
  const { t } = useTranslation()
  const { name: brand, Icon, iconClass, render } = PLATFORMS[platform]
  const name = platform === 'email' ? t('share.email') : brand

  return render({
    url,
    title,
    button: {
      'aria-label': t('share.a11y.share_on', { platform: name }),
      className: row ? ROW_TARGET_CLASS : TARGET_CLASS,
      resetButtonStyle: false,
      beforeOnClick: onPick,
      children: (
        <>
          <Icon {...ICON_PROPS} className={iconClass} size={row ? 48 : ICON_PROPS.size} />
          <span className="max-w-full truncate">{name}</span>
        </>
      ),
    },
  })
}

export type ShareTargetsProps = {
  url: string
  title: string
  /** The viewer's country (ISO alpha-2), which picks and orders the targets. */
  country?: string
  /** Called as a network's page or the mail app takes over. */
  onPick?: () => void
  /** The grid's last target: Copy link. */
  children?: ReactNode
}

/**
 * The region's share targets in one wrapping grid, each named below its disc, closed by Copy link.
 * This is what the Share button offers where the device has no share sheet of its own.
 */
export function ShareTargets({ url, title, country, onPick, children }: ShareTargetsProps) {
  return (
    <div className="flex max-w-[304px] flex-row flex-wrap justify-center gap-x-1 gap-y-3">
      {platformsForCountry(country).map((platform) => (
        <PlatformButton
          key={platform}
          platform={platform}
          title={title}
          url={url}
          onPick={onPick}
        />
      ))}
      {children}
    </div>
  )
}
