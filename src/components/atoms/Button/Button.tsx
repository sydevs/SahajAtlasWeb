import { type ComponentProps, type ReactNode, type Ref, forwardRef } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { Spinner } from '@/components/atoms/Spinner/Spinner'

/**
 * The shared control surface: the colour × variant matrix, the size scale, the
 * corner radius, and the icon-only sizing. Exported because it skins more than
 * one component — Button applies it to its own root, while ActionCircle applies
 * it to the tinted circle inside its column (see the note in ActionRow). Sharing
 * the recipe is what keeps `color` / `variant` / `size` / `radius` meaning the
 * same thing everywhere.
 *
 * The matrix is spelled out as literal classes so Tailwind's scanner sees every
 * utility — it can't resolve a class built at runtime.
 */
export const controlSurface = tv({
  base: 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,opacity]',
  variants: {
    color: { primary: '', secondary: '', default: '', danger: '' },
    variant: {
      solid: '',
      flat: '',
      faded: 'border',
      bordered: 'border bg-transparent',
      /** No surface until hovered — toolbar//header controls that must recede. */
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    },
    /**
     * Corner radius, matching the Chip atom's vocabulary: `sm` is the control's
     * standard corner, `full` is fully round. Independent of what's inside, so a
     * label button can be a pill and an icon-only one a circle.
     */
    radius: {
      sm: 'rounded',
      full: 'rounded-full',
    },
    /**
     * Drop the horizontal padding and square the width against the size scale —
     * for a control whose entire content is a glyph. Orthogonal to `radius`:
     * square icon buttons are `sm`, the action row's circles are `full`.
     */
    isIconOnly: { true: 'px-0', false: '' },
  },
  compoundVariants: [
    // solid
    {
      color: 'primary',
      variant: 'solid',
      class: 'bg-primary-9 text-primary-foreground hover:bg-primary-10',
    },
    {
      color: 'secondary',
      variant: 'solid',
      class: 'bg-secondary-9 text-secondary-foreground hover:bg-secondary-10',
    },
    // gray-1 rather than a literal white so the pairing follows the ramp in dark
    // mode too (every other cell in this matrix uses a token).
    { color: 'default', variant: 'solid', class: 'bg-gray-9 text-gray-1 hover:bg-gray-10' },
    {
      color: 'danger',
      variant: 'solid',
      class: 'bg-danger-9 text-danger-foreground hover:bg-danger-10',
    },
    // flat (soft tint)
    {
      color: 'primary',
      variant: 'flat',
      class: 'bg-primary-3 text-primary-11 hover:bg-primary-4 active:bg-primary-5',
    },
    {
      color: 'secondary',
      variant: 'flat',
      class: 'bg-secondary-3 text-secondary-11 hover:bg-secondary-4 active:bg-secondary-5',
    },
    {
      color: 'default',
      variant: 'flat',
      class: 'bg-gray-3 text-gray-12 hover:bg-gray-4 active:bg-gray-5',
    },
    {
      color: 'danger',
      variant: 'flat',
      class: 'bg-danger-3 text-danger-11 hover:bg-danger-4 active:bg-danger-5',
    },
    // faded (subtle bg + border)
    {
      color: 'primary',
      variant: 'faded',
      class: 'border-primary-6 bg-primary-2 text-primary-11 hover:bg-primary-3',
    },
    {
      color: 'secondary',
      variant: 'faded',
      class: 'border-secondary-6 bg-secondary-2 text-secondary-11 hover:bg-secondary-3',
    },
    {
      color: 'default',
      variant: 'faded',
      class: 'border-gray-6 bg-gray-2 text-gray-12 hover:bg-gray-3',
    },
    {
      color: 'danger',
      variant: 'faded',
      class: 'border-danger-6 bg-danger-2 text-danger-11 hover:bg-danger-3',
    },
    // bordered (outline)
    {
      color: 'primary',
      variant: 'bordered',
      class: 'border-primary-7 text-primary-11 hover:bg-primary-3',
    },
    {
      color: 'secondary',
      variant: 'bordered',
      class: 'border-secondary-7 text-secondary-11 hover:bg-secondary-3',
    },
    { color: 'default', variant: 'bordered', class: 'border-gray-7 text-gray-12 hover:bg-gray-3' },
    {
      color: 'danger',
      variant: 'bordered',
      class: 'border-danger-7 text-danger-11 hover:bg-danger-3',
    },
    // ghost (surface only on hover)
    { color: 'primary', variant: 'ghost', class: 'text-primary-11 hover:bg-primary-3' },
    { color: 'secondary', variant: 'ghost', class: 'text-secondary-11 hover:bg-secondary-3' },
    // The drawer header's controls: subtle until hovered, then full contrast, so
    // close / list-toggle / filter read as one set.
    {
      color: 'default',
      variant: 'ghost',
      class: 'text-gray-11 hover:bg-primary-3 hover:text-foreground',
    },
    { color: 'danger', variant: 'ghost', class: 'text-danger-11 hover:bg-danger-3' },
    // Icon-only controls are square: the width tracks the height from the size
    // scale, so the control stays square (and the circle round) at every size.
    { isIconOnly: true, size: 'sm', class: 'w-8' },
    { isIconOnly: true, size: 'md', class: 'w-10' },
    { isIconOnly: true, size: 'lg', class: 'w-12' },
  ],
  defaultVariants: {
    color: 'default',
    variant: 'solid',
    size: 'md',
    radius: 'sm',
    isIconOnly: false,
  },
})

const button = tv({
  extend: controlSurface,
  base: [
    'outline-none',
    'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
    'disabled:pointer-events-none disabled:opacity-disabled',
  ],
})

type ButtonOwnProps = VariantProps<typeof button> & {
  isLoading?: boolean
  children?: ReactNode
  className?: string
}

// Renders a real <button> by default, or an <a> when given an `href`. Each arm
// carries its own element props + keyboard semantics. `disabled` is omitted from
// the anchor arm on purpose: an <a> has no disabled state, so accepting it would
// typecheck while shipping a fully clickable link (the attribute is inert on an
// anchor). A disabled link-button should render as a <button> instead.
export type ButtonProps =
  | (ButtonOwnProps & Omit<ComponentProps<'button'>, 'color'>)
  | (ButtonOwnProps & { href: string } & Omit<ComponentProps<'a'>, 'color' | 'disabled'>)

const SPINNER_SIZE = { sm: 'sm', md: 'sm', lg: 'md' } as const

// forwardRef so Radix `asChild` slots (Dialog.Trigger / Dialog.Close) and
// floating-ui popover triggers can attach their ref to the underlying element.
//
// `data-vaul-no-drag` on every button: these sit on the vaul bottom sheet, which
// is draggable across its whole surface. Without it vaul treats a tap carrying
// any micro-movement as a drag and swallows the click, so controls fire only
// intermittently. Inert outside vaul, so it costs nothing to apply universally
// rather than leaving each control to remember it.
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(
    { color, variant, size, radius, isIconOnly, isLoading = false, children, className, ...props },
    ref,
  ) {
    const classes = button({ color, variant, size, radius, isIconOnly, className })
    const content = (
      <>
        {isLoading && <Spinner decorative color="current" size={SPINNER_SIZE[size ?? 'md']} />}
        {children}
      </>
    )

    if ('href' in props && props.href != null) {
      const { href, target, rel, ...anchorProps } = props as { href: string } & ComponentProps<'a'>

      return (
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          data-vaul-no-drag
          aria-busy={isLoading || undefined}
          className={classes}
          href={href}
          rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
          target={target}
          {...anchorProps}
        >
          {content}
        </a>
      )
    }

    const { disabled, type = 'button', ...buttonProps } = props as ComponentProps<'button'>

    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        data-vaul-no-drag
        aria-busy={isLoading || undefined}
        className={classes}
        disabled={disabled || isLoading}
        type={type}
        {...buttonProps}
      >
        {content}
      </button>
    )
  },
)
