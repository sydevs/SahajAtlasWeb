import { type MouseEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import clsx from 'clsx'
import { Check, Link, Share } from 'lucide-react'

import { ShareTargets } from './platform-buttons'

import { Button, type ButtonProps } from '@/components/atoms/Button'
import { useCoarsePointer } from '@/config/responsive'
import { useCopy } from '@/hooks/use-copy'
import { usePopover } from '@/hooks/use-popover'
import { useWebShare } from '@/hooks/use-web-share'
import { overlayContainer } from '@/lib/overlay'

// The button itself changes, under the visitor's thumb, so the answer is where they are already
// looking. The raw URL stays below as a caption, to show what is shared and to select by
// hand where a host page refuses the clipboard.
function CopyLinkButton({ url }: { url: string }) {
  const { t } = useTranslation()
  const touch = useCoarsePointer()
  const { copied, copy } = useCopy(2500)
  const [failed, setFailed] = useState(false)
  const captionRef = useRef<HTMLParagraphElement>(null)
  const status = copied ? t('share.link_copied') : ''

  // A host's Permissions-Policy, or a page that is not https, refuses the clipboard: the link is
  // selected instead, which the hint below names.
  const onClick = async () => setFailed(!(await copy(url, captionRef.current)))

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full"
        color="primary"
        size="lg"
        variant={copied ? 'flat' : 'bordered'}
        onClick={() => void onClick()}
      >
        {copied ? <Check aria-hidden size={18} strokeWidth={3} /> : <Link aria-hidden size={18} />}
        {status || t('share.copy_link')}
      </Button>
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
      {failed && (
        <p className="text-sm text-danger-11" role="alert">
          {t(touch ? 'share.copy_failed_touch' : 'share.copy_failed_pointer')}
        </p>
      )}
      <p
        ref={captionRef}
        className={clsx(
          'text-center text-xs text-gray-11 select-all',
          failed ? 'break-all' : 'truncate',
        )}
        title={url}
      >
        {url}
      </p>
    </div>
  )
}

export type ShareButtonProps = ShareContentProps & {
  /** The trigger's skin. Defaults to the share block's full-width solid button. */
  className?: string
  color?: ButtonProps['color']
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  /** The trigger's content. Defaults to the share icon and "Share…". */
  children?: ReactNode
}

/**
 * Share, as one button. It opens the device's own share sheet, which lists the apps this person
 * uses. Where there is none (most desktop browsers), or a host page refuses it, the same button
 * opens the region's share targets in a popover instead.
 */
export function ShareButton({
  label,
  url,
  country,
  className = 'w-full',
  color = 'primary',
  variant = 'solid',
  size = 'lg',
  children,
}: ShareButtonProps) {
  const { t } = useTranslation()
  const { canShare, share } = useWebShare()
  const { isOpen, setIsOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } =
    usePopover({ placement: 'bottom', role: 'dialog', toggleOnClick: false })

  const onClick = async () => {
    if (!canShare || isOpen) return setIsOpen(!isOpen)
    if ((await share({ title: label, url })) === 'unavailable') setIsOpen(true)
  }

  // A network hands over to its page or the mail app, so the popover goes with it. Copy link
  // answers in place, so it stays.
  const closeOnPick = (event: MouseEvent) => {
    const button = (event.target as Element).closest('button')

    if (button && !button.hasAttribute('data-share-copy')) setIsOpen(false)
  }

  return (
    <>
      <Button
        ref={refs.setReference}
        className={className}
        color={color}
        size={size}
        variant={variant}
        {...getReferenceProps({ onClick: () => void onClick() })}
      >
        {children ?? (
          <>
            <Share aria-hidden size={18} />
            {t('share.native')}
          </>
        )}
      </Button>
      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          {/* Non-modal and focus-returning, as the contact popover is: focus goes in to the
              first network, and Esc or an outside click puts it back on Share. */}
          <FloatingFocusManager context={context} modal={false} returnFocus={true}>
            <div
              ref={refs.setFloating}
              className="z-50 max-w-[calc(100vw-16px)] rounded-lg border border-gray-6 bg-background p-3 shadow-xl"
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': t('share.native'), onClick: closeOnPick })}
            >
              <ShareTargets country={country} title={label} url={url} />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}

export type ShareContentProps = {
  label: string
  url: string
  /**
   * The viewer's country (ISO alpha-2). It picks and orders the share targets to their region
   * (`platformsForCountry`). The consumer resolves it, through `useViewerCountry`, so this
   * molecule stays pure and SSR-testable. When absent, this uses the default platform set.
   */
  country?: string
}

/**
 * The share block on the registration confirmation: Share
 * (the device's own sheet, or the region's targets in a popover), then Copy link.
 *
 * `label` and `url` pass through raw. react-share and the native sheet encode their own
 * parameters, so an `encodeURI` here would double-encode them.
 */
export function ShareContent({ label, url, country }: ShareContentProps) {
  return (
    <div className="flex flex-col gap-3">
      <ShareButton country={country} label={label} url={url} />
      <CopyLinkButton url={url} />
    </div>
  )
}
