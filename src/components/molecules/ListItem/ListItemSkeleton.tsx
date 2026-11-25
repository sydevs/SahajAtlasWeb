import { SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'
import { ListRowSkeleton } from '@/components/molecules/List/List'

/** Shared with `ListItem`, so the placeholder row and the real one cannot drift apart. */
export const LIST_ITEM_ROW = 'min-h-14 py-3'
export const LIST_ITEM_ICON = 'me-3 flex h-6 w-6 shrink-0 items-center justify-center'
export const LIST_ITEM_LABEL = 'flex-grow text-lg'
export const LIST_ITEM_COUNT = 'me-1 text-end text-sm text-gray-11'

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
