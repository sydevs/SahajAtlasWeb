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
      <li className="py-4 flex flex-row items-center font-semibold">
        {icon}
        <div className="text-lg flex-grow">
          <div>{label}</div>
          {subtitle && <div className="text-md font-light mt-0.5">{subtitle}</div>}
        </div>
        <div className="text-end me-1">{count}</div>
        <RightArrowIcon className="text-xl" />
      </li>
    </Link>
  )
}
