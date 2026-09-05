import type { ReactNode } from 'react'

import { ChevronRight } from 'lucide-react'

import { listRow } from '@/components/molecules/List/List'
import { Link } from '@/components/atoms/Link'

export interface ListItemProps {
  label: string
  subtitle?: string | null
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

/**
 * A navigable row in a region list: the country to region to area
 * drill-down, and the online-classes entry that belongs to no region. One
 * component covers all of them. The only thing that varies is the glyph
 * in the icon slot.
 */
export function ListItem({ label, subtitle, count, href, icon }: ListItemProps) {
  return (
    <li>
      <Link
        className={listRow({ className: 'flex flex-row items-center py-4 font-semibold' })}
        href={href}
      >
        {icon && (
          <span className="me-3 flex h-7 w-7 shrink-0 items-center justify-center lg:h-9 lg:w-9">
            {icon}
          </span>
        )}
        <div className="flex-grow text-lg">
          <div>{label}</div>
          {subtitle && <div className="mt-0.5 text-md font-normal">{subtitle}</div>}
        </div>
        {/* Both step down from the title, but not to the same place. The
            count is still information, so it keeps a readable step. The
            chevron only restates what tapping the row already does, so it
            goes one step further. The title stays `text-foreground`
            (gray-12), and remains the loudest thing in the row. */}
        <div className="me-1 text-end text-gray-10">{count}</div>
        <ChevronRight className="text-gray-9 rtl:-scale-x-100" size={20} />
      </Link>
    </li>
  )
}
