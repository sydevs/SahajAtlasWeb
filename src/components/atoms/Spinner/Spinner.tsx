import { tv, type VariantProps } from 'tailwind-variants'

// Radix Primitives ships no spinner (only Radix Themes does), so — like the
// Radix+Tailwind ecosystem (shadcn/ui) — this is a plain SVG with `animate-spin`
// and the colour driven by `currentColor`. (A CSS border-ring on a <span> won't
// animate: `transform` is ignored on inline elements.)
const spinner = tv({
  slots: {
    base: 'flex flex-col items-center justify-center gap-2',
    icon: 'animate-spin',
    label: 'text-sm text-gray-11',
  },
  variants: {
    color: {
      primary: { icon: 'text-primary-9' },
      secondary: { icon: 'text-secondary-9' },
      default: { icon: 'text-gray-9' },
      // Inherit the surrounding text colour — used by Button so the spinner
      // matches the label across every colour/variant.
      current: { icon: 'text-current' },
    },
    size: {
      sm: { icon: 'h-5 w-5' },
      md: { icon: 'h-8 w-8' },
      lg: { icon: 'h-10 w-10' },
    },
  },
  defaultVariants: {
    color: 'primary',
    size: 'md',
  },
})

export type SpinnerProps = VariantProps<typeof spinner> & {
  label?: string
  className?: string
  /**
   * Render as pure decoration — no live region, no "Loading" text. Set this when
   * the spinner sits inside a control that already announces its busy state
   * (Button carries `aria-busy`), so a screen reader doesn't hear "Loading"
   * layered over the control's own label.
   */
  decorative?: boolean
}

export function Spinner({ color, size, label, className, decorative = false }: SpinnerProps) {
  const { base, icon, label: labelClass } = spinner({ color, size })

  return (
    <div
      aria-live={decorative ? undefined : 'polite'}
      className={base({ className })}
      role={decorative ? undefined : 'status'}
    >
      <svg aria-hidden="true" className={icon()} fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          fill="currentColor"
        />
      </svg>
      {label && <span className={labelClass()}>{label}</span>}
      {!label && !decorative && <span className="sr-only">Loading</span>}
    </div>
  )
}
