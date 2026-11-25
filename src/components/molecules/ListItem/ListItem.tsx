import type { ReactNode } from 'react'

import {
  LIST_ITEM_COUNT,
  LIST_ITEM_ICON,
  LIST_ITEM_LABEL,
  LIST_ITEM_ROW,
  ListRow,
} from '@/components/molecules/List/List'

export interface ListItemProps {
  label: string
  /** A short line under the label, for a row whose label alone does not say what it leads to. */
  description?: string
  count: number
  href: string
  /**
   * Leading glyph. This is named, not `children`, because its position is
   * load-bearing. It renders in a fixed slot before the label, not as
   * body content. The slot owns the size and spacing, so every row lines
   * up whatever the glyph is, such as a country flag or the
   * online-classes figure, and callers pass the bare glyph.
   */
  icon?: ReactNode
}

/**
 * A navigable row in a region list: the country to region to area
 * drill-down, and the online-classes entry that belongs to no region. One
 * component covers all of them. Only the glyph in the icon slot and an
 * optional line under the label vary.
 */
export function ListItem({ label, description, count, href, icon }: ListItemProps) {
  return (
    <ListRow className={LIST_ITEM_ROW} href={href}>
      {icon && (
        // One 24px slot at every width, so a flag row is no taller than a plain one.
        <span className={LIST_ITEM_ICON}>{icon}</span>
      )}
      <div className={LIST_ITEM_LABEL}>
        {label}
        {description && <div className="text-sm text-gray-11">{description}</div>}
      </div>
      {/* The count steps down from the title, and ListRow's chevron one
          step further. The count is still information, so it keeps
          gray-11, the ramp's readable low-contrast TEXT step — gray-10 is
          a hover solid and measured under 4.5:1 here (#432). The title
          stays `text-foreground` (gray-12), the loudest thing in the row. */}
      <div className={LIST_ITEM_COUNT}>{count}</div>
    </ListRow>
  )
}
