import type { NearbyClass } from './use-nearby-classes'

import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { Link } from '@/components/atoms/Link'

/**
 * "Is it one of these?" — shown once a new listing's place lands on a class already on the map,
 * so a host who missed their own listing corrects it instead of sending a duplicate.
 */
export function NearbyClassNotice({ classes }: { classes: NearbyClass[] }) {
  const { t } = useTranslation()

  if (classes.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-divider bg-gray-2 p-3">
      <p className="text-sm font-medium">{t('submit.where.nearby_title')}</p>
      <p className="text-sm text-gray-11">{t('submit.where.nearby_body_near')}</p>
      <ul className="flex flex-col gap-1">
        {classes.slice(0, 3).map((nearby) => (
          <li key={nearby.id}>
            <Link
              className="flex w-full items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
              href={nearby.correctPath}
            >
              <span className="line-clamp-2 min-w-0 font-medium">{nearby.title}</span>
              <span className="flex shrink-0 items-center gap-0.5 text-primary">
                {t('submit.where.nearby_action')}
                <ChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
