import type { ReactNode } from 'react'

import { ChevronRight } from 'lucide-react'

import { listRow } from '@/components/molecules/List/List'
import { Link } from '@/components/atoms/Link'

export interface ListItemProps {
  label: string
  count: number
  href: string
  /**
   * Leading glyph. This is named, not `children`, because its position is
   * load-bearing. It renders in a fixed slot before the label, not as
   * body content. The slot owns the size and spacing, so every row lines
   * up whatever the glyph is, such as a country flag or the
   * online-classes monitor, and callers pass the bare glyph.
   */
  icon?: ReactNode
}

const { row, chevron } = listRow()

/**
 * A navigable row in a region list: the country to region to area
 * drill-down, and the online-classes entry that belongs to no region. One
 * component covers all of them. The only thing that varies is the glyph
 * in the icon slot.
 */
export function ListItem({ label, count, href, icon }: ListItemProps) {
  return (
    <li>
      <Link className={row({ className: 'min-h-14 py-3' })} href={href}>
        {icon && (
          // One 24px slot at every width, so a flag row is no taller than a plain one.
          <span className="me-3 flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
        )}
        <div className="flex-grow text-lg">{label}</div>
        {/* The count steps down from the title, and the chevron (listRow)
            one step further. The count is still information, so it keeps
            gray-11, the ramp's readable low-contrast TEXT step — gray-10 is
            a hover solid and measured under 4.5:1 here (#432). The title
            stays `text-foreground` (gray-12), the loudest thing in the row. */}
        <div className="me-1 text-end text-sm text-gray-11">{count}</div>
        <ChevronRight className={chevron()} size={20} />
      </Link>
    </li>
  )
}
