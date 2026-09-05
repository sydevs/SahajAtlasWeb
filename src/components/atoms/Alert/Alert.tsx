import { type ReactNode } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { Info, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'

// A status banner. It replaces NextUI's Alert and uses the Radix-semantic tokens.
// `flat` applies a soft tint. `bordered` adds an outline. `color` selects the ramp.
// `danger` always keeps the fixed status red, never the brand tint.
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
    // Top-align a two-line alert. Centre a single line of text vertically.
    align: { start: { base: 'items-start' }, center: { base: 'items-center' } },
    // `sm` is a slimmer banner (tighter padding + gap) for compact inline prompts.
    size: { md: '', sm: { base: 'gap-2 p-2' } },
    /**
     * Where the content sits. This also sets the whole layout.
     *
     * `left` is the default. It renders the banner shape: an icon in a column beside the text.
     *
     * `center` stacks the content instead. The icon sits above the text, and everything
     * centres. An icon pinned to the left of centred text would look like a misaligned
     * banner, not a centred one.
     *
     * `left` emits `text-start` instead of nothing. These alerts can render inside
     * containers that centre their own text, such as the fallback panel. An unset
     * alignment would inherit that centring. `textAlign` is declared LAST, so its classes
     * win the merge against `align` above. `align` sets the cross-axis for the row layout
     * that `textAlign` replaces.
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

// A round info/alert glyph. It renders only when the caller gives no custom icon.
// It was hand-drawn until #003. It already matched the Lucide style: a 2px stroke
// on a 24-unit grid. It now uses the real Lucide icon.
const DefaultIcon = () => <Info className="h-5 w-5" />

/** See `ChipCloseProps`. The dismiss button and its label travel together. */
type AlertCloseProps =
  | { onClose: () => void; closeLabel: string }
  | { onClose?: never; closeLabel?: never }

export type AlertProps = VariantProps<typeof alert> & {
  title?: ReactNode
  description?: ReactNode
  /** Custom leading icon, or `false` to render none. */
  icon?: ReactNode | false
  /**
   * Live-region role. `'status'` is polite and is the default. `'alert'` is assertive.
   * Most alerts are passive, such as empty-result notices and suggestions. An assertive
   * announcement interrupts a screen reader mid-sentence. So `'alert'` is opt-in, for
   * genuine errors only.
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
  // This centres the icon and the dismiss button vertically by default, when the alert
  // shows one line of text. That means exactly one of `title` or `description`, and no
  // extra children. A taller two-line alert aligns to the top instead. A caller can
  // override this with `align`.
  //
  // This choice does not matter under `textAlign="center"`. That layout already centres
  // everything on the cross-axis. The code still passes `align` on, so the two variants
  // stay independent. Otherwise one variant would silently control the other.
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
