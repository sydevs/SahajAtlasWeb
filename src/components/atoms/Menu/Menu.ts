import { tv } from 'tailwind-variants'

/**
 * The skin the app's three Radix dropdown menus share.
 *
 * Each menu used to spell the whole pair of strings itself, which made an intended difference
 * and an accidental one look identical — so the three copies could diverge with every gate green
 * (#367). Naming each difference as a variant is what tells them apart, as `fieldChrome` does for
 * the field controls.
 *
 * **This folder holds no component**, and the skin is the reason there is nothing else to share:
 * each menu composes the primitive differently — a radio group, a radio group with submenus, a
 * column of link-outs — so an atom wrapping Radix DropdownMenu would have to model all three.
 */
export const menuChrome = tv({
  slots: {
    surface: 'z-50 rounded-xl border border-divider bg-background p-1 text-foreground shadow-xl',
    row: 'flex cursor-pointer rounded-lg py-2 text-sm outline-none select-none data-[highlighted]:bg-primary-3',
  },
  variants: {
    rows: {
      inline: { surface: 'min-w-44', row: 'items-center gap-2 px-2' },
      /** A label over a sub-label, which needs the extra width and padding. */
      stacked: { surface: 'min-w-56', row: 'flex-col items-start px-3' },
    },
    /** A SubTrigger row stays tinted while its submenu is open. */
    submenus: { true: { row: 'data-[state=open]:bg-primary-3' } },
  },
  defaultVariants: { rows: 'inline' },
})
