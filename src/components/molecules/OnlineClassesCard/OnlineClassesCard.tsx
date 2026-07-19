import { useTranslation } from 'react-i18next'

import { MonitorIcon } from '@/components/atoms/Icons'
import { RegionCard } from '@/components/molecules/RegionCard'

export interface OnlineClassesCardProps {
  count: number
  href: string
}

// A list entry into online classes — placeless events that belong to no region.
// Rendered on a region view (→ the `<region>/online` roll-up drawer) and on the
// country list (→ the online-filtered search); only `count`/`href` differ, so the
// icon + label stay in one place.
export function OnlineClassesCard({ count, href }: OnlineClassesCardProps) {
  const { t } = useTranslation('common')

  return (
    <RegionCard
      count={count}
      href={href}
      icon={<MonitorIcon className="me-3 shrink-0 text-2xl" />}
      label={t('online_classes')}
    />
  )
}
