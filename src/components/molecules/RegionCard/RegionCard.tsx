import { Link } from '@/components/atoms/Link'
import { RightArrowIcon } from '@/components/atoms/Icons'

export interface RegionCardProps {
  label: string
  subtitle?: string | null
  count: number
  href: string
  children?: React.ReactNode
}

export function RegionCard({ label, subtitle, count, href, children }: RegionCardProps) {
  return (
    <Link
      className="px-6 block text-inherit transition-colors hover:bg-primary-2 dark:hover:bg-gray-3"
      href={href}
    >
      <li className="py-4 flex flex-row items-center font-semibold border-b border-divider">
        {children}
        <div className="text-lg flex-grow">
          <div>{label}</div>
          {subtitle && <div className="text-md font-light mt-0.5">{subtitle}</div>}
        </div>
        <div className="text-right mr-1">{count}</div>
        <RightArrowIcon className="text-xl" />
      </li>
    </Link>
  )
}
