import { type ReactNode } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { Info, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'

// A status banner replacing NextUI's Alert, on the Radix-semantic tokens. `flat`
// is a soft tint, `bordered` adds an outline; `color` selects the ramp
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
    color: { primary: '', secondary: '', contrast: '', neutral: '', danger: '' },
    variant: { flat: '', bordered: 'border' },
    // Top-align a two-line alert; vertically centre a single line of text.
    align: { start: { base: 'items-start' }, center: { base: 'items-center' } },
    // `sm` is a slimmer banner (tighter padding + gap) for compact inline prompts.
    size: { md: '', sm: { base: 'gap-2 p-2' } },
    /**
     * Where the content sits, and with it the whole layout. `left` (the default) is the
     * banner shape: icon in a column beside the text.
     *
     * `center` stacks instead — icon ABOVE the text, everything centred — because an icon
     * pinned to the left of centred text reads as a misaligned banner rather than a
     * centred one.
     *
     * `left` emits `text-start` rather than nothing: these render inside containers that
     * centre their own text (the fallback panel does), and an unset alignment would
     * inherit it. Declared LAST so its classes win the merge against `align` above, which
     * sets the cross-axis for the row layout this replaces.
     */
    textAlign: {
      left: { base: 'text-start' },
      center: { base: 'flex-col items-center text-center' },
    },
  },
  compoundVariants: [
    { color: 'primary', variant: 'flat', class: { base: 'bg-primary-3 text-primary-11' } },
    { color: 'secondary', variant: 'flat', class: { base: 'bg-secondary-3 text-secondary-11' } },
    { color: 'contrast', variant: 'flat', class: { base: 'bg-contrast-3 text-contrast-11' } },
    { color: 'neutral', variant: 'flat', class: { base: 'bg-gray-3 text-gray-12' } },
    { color: 'danger', variant: 'flat', class: { base: 'bg-danger-3 text-danger-11' } },
    { color: 'primary', variant: 'bordered', class: { base: 'border-primary-6 text-primary-11' } },
    {
      color: 'secondary',
      variant: 'bordered',
      class: { base: 'border-secondary-6 text-secondary-11' },
    },
    {
      color: 'contrast',
      variant: 'bordered',
      class: { base: 'border-contrast-6 text-contrast-11' },
    },
    { color: 'neutral', variant: 'bordered', class: { base: 'border-gray-6 text-gray-12' } },
    { color: 'danger', variant: 'bordered', class: { base: 'border-danger-6 text-danger-11' } },
  ],
  defaultVariants: { color: 'neutral', variant: 'flat', size: 'md', textAlign: 'left' },
})

// A round info/alert glyph used when no custom icon is supplied. Hand-drawn until #003 —
// it was already the Lucide idiom (stroke, 2px, 24 grid), so it is now the real thing.
const DefaultIcon = () => <Info className="h-5 w-5" />

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
  textAlign,
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
  //
  // Moot under `textAlign="center"`, whose column layout centres everything on the
  // cross-axis anyway; passing it on keeps the two variants independent rather than
  // making one silently condition the other.
  const autoAlign = !children && Boolean(title) !== Boolean(description) ? 'center' : 'start'
  const slots = alert({ color, variant, size, textAlign, align: align ?? autoAlign })

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
          <X size={14} />
        </Button>
      )}
    </div>
  )
}
