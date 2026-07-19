import { type ReactNode } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { Button } from '@/components/atoms/Button'
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
    close: '-me-1 shrink-0 opacity-60 hover:opacity-100',
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
  defaultVariants: { color: 'default', variant: 'flat', size: 'md' },
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

/** See `ChipCloseProps` — the dismiss button and its label travel together. */
type AlertCloseProps =
  | { onClose: () => void; closeLabel: string }
  | { onClose?: never; closeLabel?: never }

export type AlertProps = VariantProps<typeof alert> & {
  title?: ReactNode
  description?: ReactNode
  /** Custom leading icon, or `false` to render none. */
  icon?: ReactNode | false
  /**
   * Live-region role: `'status'` (polite — the default) or `'alert'` (assertive).
   * Most alerts are passive — empty-result notices, suggestions — and assertive
   * announcements interrupt a screen reader mid-sentence, so `'alert'` is opt-in
   * for genuine errors.
   */
  role?: 'alert' | 'status'
  children?: ReactNode
  className?: string
} & AlertCloseProps

export function Alert({
  color,
  variant,
  size,
  align,
  title,
  description,
  icon,
  onClose,
  closeLabel,
  role = 'status',
  children,
  className,
}: AlertProps) {
  // Default to vertically centring the icon (and dismiss button) when the alert is a
  // single line of text — exactly one of title/description and no extra children; a
  // taller two-line alert top-aligns. A caller can override via `align`.
  const autoAlign = !children && Boolean(title) !== Boolean(description) ? 'center' : 'start'
  const slots = alert({ color, variant, size, align: align ?? autoAlign })

  return (
    <div className={slots.base({ className })} role={role}>
      {icon !== false && <span className={slots.iconWrapper()}>{icon ?? <DefaultIcon />}</span>}
      <div className={slots.content()}>
        {title && <div className={slots.title()}>{title}</div>}
        {description && <div className={slots.description()}>{description}</div>}
        {children}
      </div>
      {onClose && (
        <Button
          isIconOnly
          aria-label={closeLabel}
          className={slots.close()}
          size="sm"
          variant="ghost"
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </Button>
      )}
    </div>
  )
}
