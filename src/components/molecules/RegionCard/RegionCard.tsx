import { listRow } from '@/components/molecules/List/List'
import { Link } from '@/components/atoms/Link'
import { RightArrowIcon } from '@/components/atoms/Icons'

export interface RegionCardProps {
  label: string
  subtitle?: string | null
  count: number
  href: string
  /** Leading glyph before the label. Named (not `children`) because its position
   *  is load-bearing — it renders before the label, not as body content. */
  icon?: React.ReactNode
}

export function RegionCard({ label, subtitle, count, href, icon }: RegionCardProps) {
  return (
    <Link className={listRow()} href={href}>
      <li className="flex flex-row items-center py-4 font-semibold">
        {icon}
        <div className="flex-grow text-lg">
          <div>{label}</div>
          {subtitle && <div className="mt-0.5 text-md font-light">{subtitle}</div>}
        </div>
        <div className="me-1 text-end">{count}</div>
        <RightArrowIcon className="text-xl" />
      </li>
    </Link>
  )
}
