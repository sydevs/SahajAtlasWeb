import type { ReactNode } from 'react'

import { ListRow } from '@/components/molecules/List/List'

export interface ListItemProps {
  label: string
  /** A short line under the label, for a row whose label alone does not say what it leads to. */
  description?: string
  /** How many classes the row leads to; left out where the row is one class. */
  count?: number
  href: string
  /**
   * Leading glyph. This is named, not `children`, because its position is
   * load-bearing. It renders in a fixed slot before the label, not as
   * body content. The slot owns the size and spacing, so every row lines
   * up whatever the glyph is, such as a country flag or the
   * online-classes figure, and callers pass the bare glyph.
   */
  icon?: ReactNode
  /** A short tag after the label, such as an online class's "Online" chip. */
  tag?: ReactNode
}

/**
 * A navigable row in a list: the country to region to area drill-down, the
 * online-classes entry that belongs to no region, and a class in the calendar's
 * lists (its name, then its time and town). One component covers all of them.
 * Only the glyph, the line under the label and the count vary.
 */
export function ListItem({ label, description, count, href, icon, tag }: ListItemProps) {
  return (
    <ListRow className="min-h-14 py-3" href={href}>
      {icon && (
        // One 24px slot at every width, so a flag row is no taller than a plain one.
        <span className="me-3 flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      )}
      <div className="flex-grow text-lg">
        {label}
        {tag && <span className="ms-2 inline-flex align-middle">{tag}</span>}
        {description && <div className="text-sm text-gray-11">{description}</div>}
      </div>
      {/* The count steps down from the title, and ListRow's chevron one
          step further. The count is still information, so it keeps
          gray-11, the ramp's readable low-contrast TEXT step — gray-10 is
          a hover solid and measured under 4.5:1 here (#432). The title
          stays `text-foreground` (gray-12), the loudest thing in the row. */}
      {count !== undefined && <div className="me-1 text-end text-sm text-gray-11">{count}</div>}
    </ListRow>
  )
}
