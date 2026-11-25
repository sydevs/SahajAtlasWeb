import { ChevronRight } from 'lucide-react'

import { SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'

/** Shared with `ListItem`, so the placeholder row and the real one cannot drift apart. */
export const LIST_ITEM_ROW = 'flex min-h-14 flex-row items-center py-3'
export const LIST_ITEM_ICON = 'me-3 flex h-6 w-6 shrink-0 items-center justify-center'
export const LIST_ITEM_LABEL = 'flex-grow text-lg'
export const LIST_ITEM_COUNT = 'me-1 text-end text-sm text-gray-11'
export const LIST_ITEM_CHEVRON = 'text-gray-9 rtl:-scale-x-100'

export interface ListItemSkeletonProps {
  /** Draw the leading glyph's slot, as a country's flag row has. */
  icon?: boolean
  /** The label's width, so a column of rows doesn't read as one block. */
  width?: string
}

/** `ListItem` before its place is known: the same row, its name and count as bars. */
export function ListItemSkeleton({ icon = false, width = 'w-2/5' }: ListItemSkeletonProps) {
  return (
    <li>
      {/* The row's gutter, and the `Link` atom's gap, without the hover and press states:
          nothing here is a link. */}
      <div className={`gap-1 px-gutter ${LIST_ITEM_ROW}`}>
        {icon && (
          <span className={LIST_ITEM_ICON}>
            <SkeletonBlock className="h-full w-full rounded-full" />
          </span>
        )}
        <SkeletonLine className={LIST_ITEM_LABEL} width={width} />
        <SkeletonLine className={LIST_ITEM_COUNT} width="w-5" />
        <ChevronRight className={LIST_ITEM_CHEVRON} size={20} />
      </div>
    </li>
  )
}
