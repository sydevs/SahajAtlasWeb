import { type ReactNode, useRef } from 'react'
import clsx from 'clsx'
import { Check, Link } from 'lucide-react'
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

import { CopyFailedCaption } from './CopyFailed'

import { useCopy } from '@/hooks/use-copy'
import { type PlatformKey, platformsForCountry } from '@/lib/share/platforms'

// 44px, not a smaller round icon: react-share sizes its button to the icon, so this IS the tap
// target (#432). Each network keeps its own brand colours, as a phone's share sheet shows them:
// a person finds their app by its colour before its glyph.
const ICON_PROPS = { round: true, size: 44 }

// One target: its disc above its name, the whole column one button. react-share's own inline reset
// is off (`resetButtonStyle`): it squared the corners and set the font, colour and outline offset.
const TARGET_CLASS =
  'focus-ring flex w-[72px] cursor-pointer flex-col items-center gap-1 rounded-lg text-xs text-gray-11'

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
}

/**
 * One region-appropriate share target: the react-share button, its round icon and the network's
 * name below it. Brand names stay as written in every language; Email is the one generic name,
 * so it takes translated copy, in the accessible name too (WCAG 2.5.3).
 */
export function PlatformButton({ platform, url, title, onPick }: PlatformButtonProps) {
  const { t } = useTranslation()
  const { name: brand, Icon, iconClass, render } = PLATFORMS[platform]
  // shortcut: borrows the report form's "Email" label until sydevs/SahajCloud#1303 ships `share.email`.
  const name = platform === 'email' ? t('common.report.email_label') : brand

  return render({
    url,
    title,
    button: {
      'aria-label': t('share.a11y.share_on', { platform: name }),
      className: TARGET_CLASS,
      resetButtonStyle: false,
      beforeOnClick: onPick,
      children: (
        <>
          <Icon {...ICON_PROPS} className={iconClass} />
          <span className="max-w-full truncate">{name}</span>
        </>
      ),
    },
  })
}

/**
 * Copy link, as one more disc in the grid. It answers on itself — a check and "Link copied" —
 * so the popover stays open. Where the host refuses the clipboard, the URL is selected below.
 */
function CopyLinkTarget({ url }: { url: string }) {
  const { t } = useTranslation()
  const { copied, failed, copy } = useCopy(2500)
  const captionRef = useRef<HTMLParagraphElement>(null)
  const label = copied ? t('share.link_copied') : t('share.copy_link')

  return (
    <>
      <button
        data-vaul-no-drag
        className={TARGET_CLASS}
        type="button"
        onClick={() => void copy(url, captionRef.current)}
      >
        <span
          className={clsx(
            'flex size-11 items-center justify-center rounded-full',
            copied ? 'bg-primary-9 text-primary-foreground' : 'bg-gray-4 text-gray-12',
          )}
        >
          {copied ? (
            <Check aria-hidden size={20} strokeWidth={3} />
          ) : (
            <Link aria-hidden size={20} />
          )}
        </span>
        <span className="max-w-full truncate">{label}</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? t('share.link_copied') : ''}
      </span>
      <CopyFailedCaption
        captionRef={captionRef}
        className={failed ? 'order-last w-full' : 'hidden'}
        failed={failed}
        url={url}
      />
    </>
  )
}

export type ShareTargetsProps = {
  url: string
  title: string
  /** The viewer's country (ISO alpha-2), which picks and orders the targets. */
  country?: string
  /** Called as a network's page or the mail app takes over; Copy link answers in place. */
  onPick?: () => void
}

/**
 * The region's share targets in one wrapping grid, each named below its disc, closed by Copy link.
 * This is what the Share button offers where the device has no share sheet of its own.
 */
export function ShareTargets({ url, title, country, onPick }: ShareTargetsProps) {
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
      <CopyLinkTarget url={url} />
    </div>
  )
}
