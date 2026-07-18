import { type ComponentProps, forwardRef } from 'react'
import { tv } from 'tailwind-variants'

// Shared chrome for the drawer header's icon-buttons (close, list-toggle, and the
// event-filters trigger): subtle by default, full-contrast on hover, so they
// render identically side by side. forwardRef so it can back a popover / Radix
// `asChild` trigger. Pass `aria-label` for an accessible name; `aria-pressed` /
// `aria-expanded` flow through for toggle affordances.
const iconButton = tv({
  base: 'shrink-0 rounded p-1 text-gray-11 transition-colors hover:bg-primary-3 hover:text-foreground',
})

export type IconButtonProps = ComponentProps<'button'>

// These sit on the vaul bottom sheet, which is draggable across its whole
// surface (handleOnly is off on mobile). Without `data-vaul-no-drag` vaul
// treats a tap that includes any micro-movement as a drag and swallows the
// click, so the close/list/filter controls fire only intermittently — opt them
// out of drag detection so every tap registers. Inert outside vaul.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      data-vaul-no-drag
      className={iconButton({ className })}
      type={type}
      {...props}
    />
  )
})
