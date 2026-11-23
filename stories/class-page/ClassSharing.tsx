import {
  LineIcon,
  LineShareButton,
  TelegramIcon,
  TelegramShareButton,
  ViberIcon,
  ViberShareButton,
  WhatsappIcon,
  WhatsappShareButton,
} from 'react-share'
import { useState, useEffect, useRef, useId } from 'react'
import { Check, Link2, Mail } from 'lucide-react'

import { Link } from '@/components/atoms/Link'
import { useLocale } from '@/hooks/use-locale'
import { useViewerCountry } from '@/hooks/use-viewer-country'
import { platformsForCountry } from '@/lib/share/platforms'

const messagingApps = {
  whatsapp: { name: 'WhatsApp', Button: WhatsappShareButton, Icon: WhatsappIcon },
  telegram: { name: 'Telegram', Button: TelegramShareButton, Icon: TelegramIcon },
  line: { name: 'LINE', Button: LineShareButton, Icon: LineIcon },
  viber: { name: 'Viber', Button: ViberShareButton, Icon: ViberIcon },
}

export function ClassSharing({
  title,
  url,
  invitation = false,
}: {
  title: string
  url: string
  invitation?: boolean
}) {
  const { t } = useLocale()
  const country = useViewerCountry()
  const urlFieldId = useId()
  const heading = invitation ? t('registration.form.invite_friend') : 'Share this class'
  const messenger = platformsForCountry(country).find(
    (key): key is keyof typeof messagingApps => key in messagingApps,
  )
  const {
    name,
    Button: MessagingButton,
    Icon: MessagingIcon,
  } = messagingApps[messenger ?? 'whatsapp']
  const action =
    'inline-flex min-w-0 flex-col items-center gap-1.5 rounded-md py-1 text-sm font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-focus'
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status !== 'copied') return
    const timer = window.setTimeout(() => setStatus('idle'), 2500)

    return () => window.clearTimeout(timer)
  }, [status])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }

  useEffect(() => {
    if (status === 'manual') {
      field.current?.focus()
      field.current?.select()
    }
  }, [status])

  return (
    <section
      aria-label={heading}
      className={
        invitation ? 'border-t border-divider pt-5 text-center' : 'border-t border-divider pt-4'
      }
    >
      <h2 className="mb-2 text-base font-semibold">{heading}</h2>
      <div className={`grid max-w-[17rem] grid-cols-3 gap-2 ${invitation ? 'mx-auto' : ''}`}>
        <button className={action} type="button" onClick={copy}>
          <span className="grid size-12 place-items-center rounded-full bg-primary text-white">
            {status === 'copied' ? (
              <Check aria-hidden size={22} />
            ) : (
              <Link2 aria-hidden size={23} />
            )}
          </span>
          <span aria-live="polite">
            {t(status === 'copied' ? 'share.copied' : 'share.copy_link')}
          </span>
        </button>
        <MessagingButton
          aria-label={t('share.share_on', { platform: name })}
          className={action}
          resetButtonStyle={false}
          title={title}
          url={url}
        >
          <MessagingIcon aria-hidden round size={48} />
          {name}
        </MessagingButton>
        <Link
          className={action}
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}
        >
          <span className="grid size-12 place-items-center rounded-full bg-gray-3 text-gray-12">
            <Mail aria-hidden size={23} />
          </span>
          Email
        </Link>
      </div>
      {status === 'manual' && (
        <div className="mt-2">
          <label className="text-sm" htmlFor={urlFieldId}>
            Copy this class link
          </label>
          <input
            ref={field}
            readOnly
            className="w-full rounded border border-divider px-2 py-1 field-size"
            id={urlFieldId}
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </section>
  )
}
