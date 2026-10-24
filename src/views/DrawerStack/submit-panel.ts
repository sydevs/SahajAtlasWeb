import type { DrawerDirection } from '@/components/atoms/Drawer'

/**
 * How the add-a-class step panel sits beside the listing it fills in (#147).
 *
 * It is a fit question, so it reads the same container signal that picks the left panel over
 * the bottom sheet: a wide widget slides the panel in from the right, leaving the map between
 * it and the listing; a narrow one raises it from the bottom, over the lower part of the
 * listing.
 */
export function submitPanelLayout(isWide: boolean): {
  direction: DrawerDirection
  className: string
} {
  if (!isWide) {
    // Sized to its content, never the full-height sheet the snap ladder needs: the listing
    // behind it must stay in view.
    return { direction: 'bottom', className: '!h-auto max-h-[70%]' }
  }

  // Full height, until its content marks itself compact (the review bar): then docked to the
  // bottom corner, so the listing and its Edit links show.
  return {
    direction: 'right',
    className: 'has-data-compact:!top-auto has-data-compact:!h-auto lg:has-data-compact:!top-auto',
  }
}
