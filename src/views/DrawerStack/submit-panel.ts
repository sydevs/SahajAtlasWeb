import type { DrawerDirection } from '@/components/atoms/Drawer'

/**
 * Where the add-a-class step panel sits (#147), beside the listing it fills in.
 *
 * It is a fit question, so it reads the same container signal that picks the left panel over
 * the bottom sheet: a wide widget slides the panel in from the right, leaving the map between
 * it and the listing; a narrow one raises it from the bottom, over the lower part of the
 * listing. A pure module, like `strip-label`, so the decision is testable without DrawerStack.
 */
export function submitPanelLayout({
  isWide,
  reviewing,
}: {
  isWide: boolean
  /** On review the panel shrinks to a bar, so the listing and its Edit links show. */
  reviewing: boolean
}): { direction: DrawerDirection; className?: string } {
  if (!isWide) {
    // Sized to its content, never the full-height sheet the snap ladder needs: the listing
    // behind it must stay in view.
    return { direction: 'bottom', className: '!h-auto max-h-[70%]' }
  }

  // Docked to the bottom corner rather than spanning the panel's full height.
  return { direction: 'right', className: reviewing ? '!top-auto !h-auto lg:!top-auto' : undefined }
}
