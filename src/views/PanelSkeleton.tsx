import type { StackEntry } from '@/lib/shape/path'
import type { RegionLevel } from '@/types'

import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

// ⚠ By leaf path, and no component of the interface: the boot panel renders these before the
// interface's code has arrived, so this module sits in the eager graph.
import {
  LOADING,
  Skeleton,
  SkeletonBlock,
  SkeletonLine,
} from '@/components/atoms/Skeleton/Skeleton'
import { List } from '@/components/molecules/List/List'
import { guessListsPlaces } from '@/lib/shape/hierarchy'

// The loading panel's few shapes: one set for every view that loads, drawn from the Skeleton
// atom alone. Each is sized like what replaces it — a 56px place row, a class card's title over
// two lines, the field's 38px box (46px on a touch screen) — so the content lands where its
// placeholder stood. `PanelSkeleton.test.tsx` pins the two rows against the real ones.

/** The header a view opens with: its search field, or Back and its title (with the search box under it). */
export type PanelHeader = 'field' | 'titled' | 'titled-field'

/** What fills the panel: place rows, class cards, or a class page. */
export type PanelBody = 'places' | 'classes' | 'class'

export type PanelShape = { header: PanelHeader; body: PanelBody }

/**
 * The shape of the view a route opens, or `null` for a view not worth drawing ahead of — the
 * calendar, the forms and the share sheet, whose data is already on hand when they open, so
 * only their code is on its way and their own header over a spinner says so.
 *
 * `level` is the place's, once the region tree has it.
 */
export function panelShape(entry: StackEntry | undefined, level?: RegionLevel): PanelShape | null {
  switch (entry?.kind) {
    case undefined:
      return { header: 'field', body: 'places' }
    case 'search':
      return { header: 'field', body: 'classes' }
    case 'region':
      return {
        header: 'titled-field',
        body: guessListsPlaces(entry.path, level) ? 'places' : 'classes',
      }
    case 'online':
      return { header: 'titled', body: 'classes' }
    case 'event':
      return { header: 'titled', body: 'class' }
    default:
      return null
  }
}

const FIELD =
  'flex h-[38px] min-w-0 flex-1 items-center gap-3 rounded-lg border border-divider bg-gray-2 ps-2 pointer-coarse:h-[46px]'

/** The search field's box, greyed and holding bars, so it reads as on its way, not as a field. */
export function FieldSkeleton() {
  return (
    <Skeleton className={FIELD}>
      <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
      <SkeletonLine className="flex-1 field-size" width="w-2/5" />
    </Skeleton>
  )
}

/** Back's row, then the title's line. */
function TitledSkeleton() {
  return (
    <Skeleton>
      <div className="mb-2 flex min-h-8 items-center">
        <SkeletonLine className="text-sm" width="w-36" />
      </div>
      <SkeletonLine className="text-xl" width="w-1/2" />
    </Skeleton>
  )
}

/** The header's content, for a panel that has no real header yet (the boot panel, the story). */
export function PanelSkeletonHeader({ header }: { header: 'field' | 'titled' }) {
  if (header === 'titled') return <TitledSkeleton />

  return (
    <>
      <FieldSkeleton />
      <Skeleton className="flex h-8 w-8 shrink-0 items-center justify-center">
        <SkeletonBlock className="h-5 w-5 rounded-full" />
      </Skeleton>
    </>
  )
}

const ROW = 'flex items-center gap-1 px-gutter'
const CHEVRON = <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />

function PlaceRows() {
  return (
    <List>
      {['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5', 'w-1/4', 'w-1/3'].map((width, row) => (
        <li key={row} className={clsx(ROW, 'min-h-14 py-3')}>
          <SkeletonLine className="flex-grow text-lg" width={width} />
          <SkeletonLine className="me-1 text-sm" width="w-5" />
          {CHEVRON}
        </li>
      ))}
    </List>
  )
}

function ClassCards() {
  return (
    <List>
      {['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3'].map((width) => (
        <li key={width} className={clsx(ROW, 'py-4')}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine className="text-lg" width={width} />
            <div className="mt-0.5 mb-1 flex flex-col gap-1.5">
              <SkeletonLine className="min-h-5.5 text-sm" width="w-1/2" />
              <SkeletonLine className="min-h-5.5 text-sm" width="w-2/5" />
            </div>
          </div>
          {CHEVRON}
        </li>
      ))}
    </List>
  )
}

/** A class's page below its title: chips, the when and where, Register, then its words. */
function ClassPage({ cta }: { cta: boolean }) {
  return (
    <div className="flex flex-col gap-4 px-gutter pt-2 pb-10">
      <div className="flex gap-1">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-16" />
      </div>
      <div className="mb-2 flex flex-col gap-2.5">
        <SkeletonLine className="text-base leading-snug" width="w-3/5" />
        <SkeletonLine className="text-base leading-snug" width="w-1/2" />
      </div>
      {cta && <SkeletonBlock className="h-10 w-full" />}
      <div className="flex flex-col gap-2">
        <SkeletonLine className="text-sm leading-snug" width="w-full" />
        <SkeletonLine className="text-sm leading-snug" width="w-4/5" />
      </div>
    </div>
  )
}

/**
 * What fills a loading panel, marked loading so the phone sheet holds still until the content
 * arrives (`useFitSnap`), and announced once, in words.
 *
 * `cta` draws Register in the class page's flow; leave it off where Register pins to the phone
 * sheet's foot once the class arrives.
 */
export function PanelSkeletonBody({ body, cta = true }: { body: PanelBody; cta?: boolean }) {
  const { t } = useTranslation()

  return (
    <div {...LOADING}>
      <p className="sr-only" role="status">
        {t(body === 'class' ? 'common.a11y.loading' : 'common.a11y.finding_classes')}
      </p>
      <Skeleton>
        {body === 'places' && <PlaceRows />}
        {body === 'classes' && <ClassCards />}
        {body === 'class' && <ClassPage cta={cta} />}
      </Skeleton>
    </div>
  )
}
