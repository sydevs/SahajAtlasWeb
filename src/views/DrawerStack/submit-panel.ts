import type { DrawerDirection } from '@/components/atoms/Drawer'

/**
 * The vaul chrome — direction and classes — for the add-a-class step panel, once
 * `submitPanelPlacement` has answered sheet-versus-inline and said `sheet` (#147).
 *
 * Which edge it comes from is a fit question, so it reads the same container signal that picks
 * the left panel over the bottom sheet: a wide widget slides the panel in from the right,
 * leaving the map between it and the listing; a narrow one raises it from the bottom, over the
 * lower part of the listing.
 *
 * Either way the panel is sized to its content and bounded, never the full-height sheet the
 * snap ladder needs: the listing behind it must stay in view, and on a wide widget the map's
 * own pin sits beside it rather than under it.
 */
export function submitSheetChrome(isWide: boolean): {
  direction: DrawerDirection
  className: string
} {
  if (!isWide) return { direction: 'bottom', className: '!h-auto max-h-[70%]' }

  // Docked to the bottom corner. `lg` re-states the top because the right variant's own
  // `lg:inset-y-4` would otherwise put it back.
  return { direction: 'right', className: '!top-auto !h-auto max-h-[70%] lg:!top-auto' }
}
