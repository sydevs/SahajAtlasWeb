import { SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'
import {
  LIST_ITEM_COUNT,
  LIST_ITEM_ICON,
  LIST_ITEM_LABEL,
  LIST_ITEM_ROW,
  ListRowSkeleton,
} from '@/components/molecules/List/List'

export interface ListItemSkeletonProps {
  /** Draw the leading glyph's slot, as a country's flag row has. */
  icon?: boolean
  /** The label's width, so a column of rows doesn't read as one block. */
  width?: string
}

/** `ListItem` before its place is known: the same row, its name and count as bars. */
export function ListItemSkeleton({ icon = false, width = 'w-2/5' }: ListItemSkeletonProps) {
  return (
    <ListRowSkeleton className={LIST_ITEM_ROW}>
      {icon && (
        <span className={LIST_ITEM_ICON}>
          <SkeletonBlock className="h-full w-full rounded-full" />
        </span>
      )}
      <SkeletonLine className={LIST_ITEM_LABEL} width={width} />
      <SkeletonLine className={LIST_ITEM_COUNT} width="w-5" />
    </ListRowSkeleton>
  )
}
