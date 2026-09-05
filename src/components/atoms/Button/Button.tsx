import { type ComponentProps, type ReactNode, type Ref, forwardRef } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { Spinner } from '@/components/atoms/Spinner/Spinner'
import { atlasError, reportInternalError } from '@/lib/report'
import { isSafeHref } from '@/lib/shape'

/**
 * The shared control surface. It holds the colour × variant matrix, the size
 * scale, the corner radius, and the icon-only sizing. It is exported because it
 * skins more than one component: Button applies it to its own root, and
 * ActionCircle applies it to the tinted circle inside its column (see the note
 * in ActionRow). Sharing one recipe keeps `color`, `variant`, `size`, and
 * `radius` meaning the same thing everywhere.
 *
 * The matrix uses literal classes, not classes built at runtime. Tailwind's
 * scanner can only see literal classes.
 */
export const controlSurface = tv({
  base: 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,opacity]',
  variants: {
    color: { primary: '', secondary: '', contrast: '', neutral: '' },
    variant: {
      solid: '',
      flat: '',
      bordered: 'border bg-transparent',
      /** No surface shows until hovered. Toolbar and header controls must recede. */
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    },
    /**
     * Corner radius. It matches the Chip atom's vocabulary. `sm` is the control's
     * standard corner. `full` is fully round. This is independent of the content,
     * so a label button can be a pill, and an icon-only button can be a circle.
     */
    radius: {
      sm: 'rounded',
      full: 'rounded-full',
    },
    /**
     * Drops the horizontal padding and squares the width against the size
     * scale, for a control whose entire content is a glyph. It sets `shrink-0`
     * because the square shape is the whole point. These controls sit in flex
     * header rows next to long titles. The default flex-shrink would squash the
     * width, and the hover square with it. This is independent of `radius`.
     * Square icon buttons use `sm`. The action row's circles use `full`.
     */
    isIconOnly: { true: 'shrink-0 px-0', false: '' },
  },
  compoundVariants: [
    // solid: a dark brand background with WHITE text in light mode. Even a light
    // brand seed, such as a pale secondary, still reads with white. Dark mode
    // keeps the ramp's light solid (step 9) and its adaptive on-color. `neutral`
    // uses the fixed gray solid. Gray-9 pairs with gray-1 or white in both modes.
    {
      color: 'primary',
      variant: 'solid',
      class:
        'bg-primary-12 text-white hover:bg-primary-11 dark:bg-primary-9 dark:text-primary-foreground dark:hover:bg-primary-10',
    },
    {
      color: 'secondary',
      variant: 'solid',
      class:
        'bg-secondary-12 text-white hover:bg-secondary-11 dark:bg-secondary-9 dark:text-secondary-foreground dark:hover:bg-secondary-10',
    },
    {
      color: 'contrast',
      variant: 'solid',
      class:
        'bg-contrast-12 text-white hover:bg-contrast-11 dark:bg-contrast-9 dark:text-contrast-foreground dark:hover:bg-contrast-10',
    },
    { color: 'neutral', variant: 'solid', class: 'bg-gray-9 text-gray-1 hover:bg-gray-10' },
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
      color: 'contrast',
      variant: 'flat',
      class: 'bg-contrast-3 text-contrast-11 hover:bg-contrast-4 active:bg-contrast-5',
    },
    {
      color: 'neutral',
      variant: 'flat',
      class: 'bg-gray-3 text-gray-12 hover:bg-gray-4 active:bg-gray-5',
    },
    // bordered (outline): the border matches the icon and text colour, at its
    // ramp's readable step. It is not a lighter divider tint.
    {
      color: 'primary',
      variant: 'bordered',
      class: 'border-primary-11 text-primary-11 hover:bg-primary-3',
    },
    {
      color: 'secondary',
      variant: 'bordered',
      class: 'border-secondary-11 text-secondary-11 hover:bg-secondary-3',
    },
    {
      color: 'contrast',
      variant: 'bordered',
      class: 'border-contrast-11 text-contrast-11 hover:bg-contrast-3',
    },
    { color: 'neutral', variant: 'bordered', class: 'border-gray-12 text-gray-12 hover:bg-gray-3' },
    // ghost (surface only on hover)
    { color: 'primary', variant: 'ghost', class: 'text-primary-11 hover:bg-primary-3' },
    { color: 'secondary', variant: 'ghost', class: 'text-secondary-11 hover:bg-secondary-3' },
    { color: 'contrast', variant: 'ghost', class: 'text-contrast-11 hover:bg-contrast-3' },
    // The drawer header's controls stay subtle until hovered, then reach full
    // contrast. This makes close, list-toggle, and filter read as one set.
    {
      color: 'neutral',
      variant: 'ghost',
      class: 'text-gray-11 hover:bg-primary-3 hover:text-foreground',
    },
    // Icon-only controls are square. The width tracks the height from the size
    // scale. So the control stays square, and the circle stays round, at every size.
    { isIconOnly: true, size: 'sm', class: 'w-8' },
    { isIconOnly: true, size: 'md', class: 'w-10' },
    { isIconOnly: true, size: 'lg', class: 'w-12' },
    // Icon-only bordered controls keep a slightly heavier 1.5px outline. A 1px
    // hairline looks like a rendering artifact around a small circle. Labelled
    // bordered buttons stay at 1px.
    { isIconOnly: true, variant: 'bordered', class: 'border-[1.5px]' },
  ],
  defaultVariants: {
    color: 'neutral',
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

// This renders a real <button> by default, or an <a> when given an `href`. Each
// arm carries its own element props and keyboard semantics. `disabled` is
// omitted from the anchor arm on purpose. An <a> has no disabled state.
// Accepting the prop would still typecheck, but it would ship a fully clickable
// link, since the attribute is inert on an anchor. A disabled link-button should
// render as a <button> instead.
export type ButtonProps =
  | (ButtonOwnProps & Omit<ComponentProps<'button'>, 'color'>)
  | (ButtonOwnProps & { href: string } & Omit<ComponentProps<'a'>, 'color' | 'disabled'>)

const SPINNER_SIZE = { sm: 'sm', md: 'sm', lg: 'md' } as const

// This uses forwardRef so Radix `asChild` slots (Dialog.Trigger / Dialog.Close)
// and floating-ui popover triggers can attach their ref to the underlying
// element.
//
// Every button carries `data-vaul-no-drag`. Buttons can sit on the vaul bottom
// sheet, which is draggable across its whole surface. Without this attribute,
// vaul reads any tap with a little movement as a drag, and swallows the click.
// So controls would fire only sometimes. The attribute does nothing outside
// vaul. So applying it everywhere costs nothing, and no control has to
// remember it itself.
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

      // This uses the shared gate (`lib/shape/href.ts`). It shares the same failure
      // mode as the `Link` atom, not a second one of its own: report the failure,
      // then degrade to the same content on a non-interactive `<span>` that
      // carries the control's classes.
      //
      // Like `Link`'s span, this span takes NO props. That is a real loss, not a
      // free one. `target`, `download`, and `rel` mean nothing on a span, but
      // `aria-label`, `id`, and `onClick` are dropped too. So an `isIconOnly`
      // Button whose only accessible name came from `aria-label` degrades to
      // unnamed content. This is accepted, because the path is unreachable by
      // design. A refusal is a developer error, found in the report, not a state
      // the app must design around. This note spells that out so nobody reads the
      // span as free of cost.
      //
      // This is specific to this site: the `.ics` download does NOT come through
      // here. It builds its own `blob:` URL on a detached anchor (see
      // `downloadIcs` in `AddToCalendar`). So keeping `blob:` out of the allowed
      // set costs it nothing.
      if (!isSafeHref(href)) {
        reportInternalError(atlasError('unknown', `Refusing to link to ${href}`), 'Button')

        return <span className={classes}>{content}</span>
      }

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
