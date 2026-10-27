import type { DrawerDirection } from '@/components/atoms/Drawer'

/**
 * The vaul chrome — direction and classes — for the add-a-class step panel, once
 * `submitPanelPlacement` has answered sheet-versus-inline and said `sheet` (#147).
 *
 * Which edge it comes from is a fit question, so it reads the same container signal that picks
 * the left panel over the bottom sheet: a wide widget slides the panel in from the right,
 * leaving the map between it and the listing; a narrow one raises it from the bottom, over the
 * lower part of the listing.
 */
export function submitSheetChrome(
  isWide: boolean,
  /** The panel's content says it is the review bar, so the listing and its Edit links show. */
  compact: boolean,
): { direction: DrawerDirection; className?: string } {
  if (!isWide) {
    // Sized to its content, never the full-height sheet the snap ladder needs: the listing
    // behind it must stay in view.
    return { direction: 'bottom', className: '!h-auto max-h-[70%]' }
  }

  // Docked to the bottom corner rather than spanning the panel's full height.
  return { direction: 'right', className: compact ? '!top-auto !h-auto lg:!top-auto' : undefined }
}
