import { type ReactNode } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { IconButton } from '@/components/atoms/Button'
import { CloseIcon } from '@/components/atoms/Icons'

// A status banner replacing NextUI's Alert, on the Radix-semantic tokens. `flat`
// is a soft tint, `bordered`/`faded` add an outline; `color` selects the ramp
// (danger stays the fixed status red, never brand-tinted).
const alert = tv({
  slots: {
    base: 'flex gap-3 rounded p-3',
    iconWrapper: 'shrink-0',
    content: 'min-w-0 flex-1',
    title: 'text-sm font-medium',
    description: 'text-sm opacity-90',
    close: '-mr-1 shrink-0',
  },
  variants: {
    color: { primary: '', secondary: '', default: '', danger: '' },
    variant: { flat: '', bordered: 'border', faded: 'border' },
    // Top-align a two-line alert; vertically centre a single line of text.
    align: { start: { base: 'items-start' }, center: { base: 'items-center' } },
    // `sm` is a slimmer banner (tighter padding + gap) for compact inline prompts.
    size: { md: '', sm: { base: 'gap-2 p-2' } },
  },
  compoundVariants: [
    { color: 'primary', variant: 'flat', class: { base: 'bg-primary-3 text-primary-11' } },
    { color: 'secondary', variant: 'flat', class: { base: 'bg-secondary-3 text-secondary-11' } },
    { color: 'default', variant: 'flat', class: { base: 'bg-gray-3 text-gray-12' } },
    { color: 'danger', variant: 'flat', class: { base: 'bg-danger-3 text-danger-11' } },
    { color: 'primary', variant: 'bordered', class: { base: 'border-primary-6 text-primary-11' } },
    {
      color: 'secondary',
      variant: 'bordered',
      class: { base: 'border-secondary-6 text-secondary-11' },
    },
    { color: 'default', variant: 'bordered', class: { base: 'border-gray-6 text-gray-12' } },
    { color: 'danger', variant: 'bordered', class: { base: 'border-danger-6 text-danger-11' } },
    {
      color: 'primary',
      variant: 'faded',
      class: { base: 'border-primary-6 bg-primary-2 text-primary-11' },
    },
    {
      color: 'secondary',
      variant: 'faded',
      class: { base: 'border-secondary-6 bg-secondary-2 text-secondary-11' },
    },
    { color: 'default', variant: 'faded', class: { base: 'border-gray-6 bg-gray-2 text-gray-12' } },
    {
      color: 'danger',
      variant: 'faded',
      class: { base: 'border-danger-6 bg-danger-2 text-danger-11' },
    },
  ],
  defaultVariants: { color: 'default', variant: 'flat', align: 'start', size: 'md' },
})

// A round info/alert glyph used when no custom icon is supplied.
const DefaultIcon = () => (
  <svg
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export type AlertProps = VariantProps<typeof alert> & {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  hideIcon?: boolean
  /** When set, renders a trailing dismiss button that calls this on click. */
  onClose?: () => void
  /** Accessible label for the dismiss button (required for a meaningful `onClose`). */
  closeLabel?: string
  children?: ReactNode
  className?: string
}

export function Alert({
  color,
  variant,
  size,
  title,
  description,
  icon,
  hideIcon,
  onClose,
  closeLabel = 'Close',
  children,
  className,
}: AlertProps) {
  // Vertically centre the icon (and dismiss button) when the alert is a single line
  // of text — exactly one of title/description and no extra children; a taller
  // two-line alert top-aligns instead.
  const centered = !children && Boolean(title) !== Boolean(description)
  const slots = alert({ color, variant, size, align: centered ? 'center' : 'start' })

  return (
    <div className={slots.base({ className })} role="alert">
      {!hideIcon && <span className={slots.iconWrapper()}>{icon ?? <DefaultIcon />}</span>}
      <div className={slots.content()}>
        {title && <div className={slots.title()}>{title}</div>}
        {description && <div className={slots.description()}>{description}</div>}
        {children}
      </div>
      {onClose && (
        <IconButton aria-label={closeLabel} className={slots.close()} onClick={onClose}>
          <CloseIcon size={16} />
        </IconButton>
      )}
    </div>
  )
}
