import { LoaderCircle } from 'lucide-react'
import { tv, type VariantProps } from 'tailwind-variants'

// Radix Primitives ships no spinner (only Radix Themes does), so this is Lucide's
// `LoaderCircle` with `animate-spin` and the colour driven by `currentColor`. (A CSS
// border-ring on a <span> won't animate: `transform` is ignored on inline elements.)
// The size variants set h/w classes, which override Lucide's own width/height attributes.
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
      contrast: { icon: 'text-contrast-9' },
      neutral: { icon: 'text-gray-9' },
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
  /**
   * The screen-reader-only name for the busy state, used when there is no visible
   * `label`. It arrives as a prop — like every other atom's copy — rather than the
   * atom reaching for `t()` itself, and that is deliberate on two counts (issue #102).
   *
   * A spinner is what a Suspense fallback renders, and some of those run before the
   * translation bundles have finished loading; `useTranslation` there resolves to the
   * raw key, so localizing in here would trade one untranslated string for a worse
   * one. It would also make this the first atom to depend on react-i18next, pulling
   * the provider into the render path of every atom that composes it (Button does).
   *
   * The default is English because English is the app's `fallbackLng` — a caller with
   * no translation to hand degrades to exactly the word this used to hard-code.
   */
  srLabel?: string
}

export function Spinner({
  color,
  size,
  label,
  className,
  decorative = false,
  srLabel = 'Loading',
}: SpinnerProps) {
  const { base, icon, label: labelClass } = spinner({ color, size })

  return (
    <div
      aria-live={decorative ? undefined : 'polite'}
      className={base({ className })}
      role={decorative ? undefined : 'status'}
    >
      <LoaderCircle className={icon()} />
      {label && <span className={labelClass()}>{label}</span>}
      {!label && !decorative && <span className="sr-only">{srLabel}</span>}
    </div>
  )
}
