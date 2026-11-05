import { type HTMLAttributes, type ReactNode, type Ref, forwardRef } from 'react'
import { tv } from 'tailwind-variants'

import { Button } from '@/components/atoms/Button'

// The secondary actions under Register: matching quiet buttons, icon plus label,
// one icon size. Emphasis belongs to Register, so these are the soft neutral Button,
// which already carries the href safety gate, focus ring and `data-vaul-no-drag`.
//
// Three actions sit icon-beside-label. A fourth (Website) leaves too little width for
// that at phone sizes, so `stacked` puts the icon above the label instead, and the row
// still never wraps or scrolls.
const actionButton = tv({
  base: 'h-11 min-w-0 flex-1 basis-0 gap-1.5 px-1 text-sm [&_svg]:shrink-0 [&_svg]:text-primary-11',
  variants: {
    stacked: { true: 'h-14 flex-col gap-0.5 text-xs' },
  },
})

export type ActionButtonProps = {
  /** A lucide icon. Sized by the row, so every action matches: pass no `size`. */
  icon: ReactNode
  label: string
  /** Renders an anchor instead of a button (tel:, maps, website links). */
  href?: string
  /** Open `href` in a new tab with the safe rel. */
  isExternal?: boolean
  /** Icon above the label, for the four-action set. */
  stacked?: boolean
  /** No surface until hovered, for an action most visitors don't need. */
  quiet?: boolean
} & Omit<HTMLAttributes<HTMLElement>, 'color'>

/** One action. The forwarded ref reaches the interactive element, and rest props spread
 *  onto it, so a popover trigger (floating-ui `getReferenceProps()`) works unchanged. */
export const ActionButton = forwardRef<HTMLElement, ActionButtonProps>(function ActionButton(
  { icon, label, href, isExternal = false, stacked = false, quiet = false, ...rest },
  ref,
) {
  const shared = {
    ref: ref as Ref<HTMLButtonElement & HTMLAnchorElement>,
    className: actionButton({ stacked }),
    color: 'neutral',
    variant: quiet ? 'ghost' : 'flat',
  } as const
  const content = (
    <>
      {icon}
      <span className="max-w-full min-w-0 truncate">{label}</span>
    </>
  )

  return href ? (
    <Button {...shared} {...rest} href={href} target={isExternal ? '_blank' : undefined}>
      {content}
    </Button>
  ) : (
    <Button {...shared} {...rest}>
      {content}
    </Button>
  )
})

export type ActionRowProps = {
  children: ReactNode
  className?: string
}

/** The horizontal action row. Children share the width equally, on one line. */
export function ActionRow({ children, className }: ActionRowProps) {
  return <div className={`flex w-full items-stretch gap-2 ${className ?? ''}`}>{children}</div>
}
