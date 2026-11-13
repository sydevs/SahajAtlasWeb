import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

import { List } from '@/components/molecules/List/List'

/**
 * The placeholder shapes the loading states draw, each shaped like the content it stands in for
 * (Devindra, 12 Nov: the old loading rows looked like nothing in particular). The boot panel,
 * before the interface's code arrives, and the drawer's loading chrome compose the same shapes,
 * so the hand-over from one to the other and then to the content doesn't jump.
 *
 * Every shape is hidden from assistive tech. A loading state says "loading" once, in words
 * (`ListSkeleton` and `EventSkeleton` carry the line), not once per bar.
 */

const BAR = 'rounded bg-gray-3'
const PULSE = 'motion-safe:animate-pulse'

/** Two rows share a width in places, so a row's position is its key. */
const ROW_WIDTHS = ['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5', 'w-1/4', 'w-1/3']

/** One width per row, the pattern repeating past its six, so any count of rows draws. */
const rowWidths = (rows: number): string[] =>
  Array.from({ length: Math.max(0, rows) }, (_, row) => ROW_WIDTHS[row % ROW_WIDTHS.length])

export interface ListSkeletonProps {
  /**
   * `places`: a name, its count and the chevron, at a place row's height (`ListItem`).
   * `classes`: a class's card (`EventListItem`), its title over its when and where lines.
   */
  variant?: 'places' | 'classes'
  /** A round mark at the start of each place row, as the country list has its flags. */
  icons?: boolean
  /** How many rows to draw: enough to fill the sheet's opening height. */
  rows?: number
}

/** A list as it will arrive, row for row, with the list's own dividers. */
export function ListSkeleton({ variant = 'places', icons = false, rows = 5 }: ListSkeletonProps) {
  const { t } = useTranslation()

  if (variant === 'classes') {
    return (
      <>
        <p className="sr-only" role="status">
          {t('common.chrome.finding_classes', { defaultValue: 'Finding classes…' })}
        </p>
        <div aria-hidden className={PULSE}>
          <List>
            {rowWidths(rows).map((width, row) => (
              <li key={row} className="flex items-center gap-1 px-gutter py-4">
                <div className="flex flex-grow flex-col gap-2.5">
                  <div className={clsx('h-4.5 w-3/5', BAR)} />
                  <div className={clsx('h-3.5', BAR, width)} />
                  <div className={clsx('h-3.5 w-1/3', BAR)} />
                </div>
                <ChevronRight className="text-gray-6 rtl:-scale-x-100" size={20} />
              </li>
            ))}
          </List>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Spoken, not drawn: a visible line would leave a gap the list then closes. */}
      <p className="sr-only" role="status">
        {t('common.chrome.finding_classes', { defaultValue: 'Finding classes…' })}
      </p>
      <div aria-hidden className={PULSE}>
        <List>
          {rowWidths(rows).map((width, row) => (
            <li key={row} className="flex min-h-14 items-center px-gutter py-3">
              {icons && <div className="me-3 h-6 w-6 shrink-0 rounded-full bg-gray-3" />}
              <div className="flex-grow">
                <div className={clsx('h-4', BAR, width)} />
              </div>
              <div className={clsx('me-1 h-3.5 w-5', BAR)} />
              <ChevronRight className="text-gray-6 rtl:-scale-x-100" size={20} />
            </li>
          ))}
        </List>
      </div>
    </>
  )
}

export interface FieldSkeletonProps {
  /** The location line under the field ("Classes near me"), as the first screen and a country
   *  page show it (`GeolocationPrompt`). */
  prompt?: boolean
  className?: string
}

/** The search field's box, with its magnifier and a line of placeholder. */
export function FieldSkeleton({ prompt = false, className }: FieldSkeletonProps) {
  return (
    <div aria-hidden className={className}>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-divider bg-gray-2 px-3">
        <div className="h-4 w-4 shrink-0 rounded-full bg-gray-4" />
        <div className={clsx('h-3 w-28', BAR)} />
      </div>
      {prompt && (
        <div className="mt-1.5 flex min-h-10 items-center gap-3 rounded-lg bg-secondary-3 ps-[9px] pe-3">
          <div className="h-4 w-5 shrink-0 rounded-full bg-secondary-5" />
          <div className="h-3 w-32 rounded bg-secondary-5" />
        </div>
      )}
    </div>
  )
}

export interface TitleSkeletonProps {
  /** Draw the Back row above the title, as every view below the first screen has. */
  back?: boolean
  /** A class's title often runs to two lines; a place's name fits one. */
  lines?: 1 | 2
}

/** A view's header before its name is known: the Back row, then the title's line(s). */
export function TitleSkeleton({ back = false, lines = 1 }: TitleSkeletonProps) {
  return (
    <div aria-hidden className={clsx('flex flex-col', PULSE)}>
      {back && (
        // NavRow's height and the gap under it, so the title lands where the real one will.
        <div className="mb-2 flex min-h-8 items-center">
          <div className={clsx('h-3.5 w-36', BAR)} />
        </div>
      )}
      <div className="flex h-7 items-center">
        <div className={clsx('h-5', BAR, lines === 2 ? 'w-4/5' : 'w-1/2')} />
      </div>
      {lines === 2 && (
        <div className="flex h-7 items-center">
          <div className={clsx('h-5 w-2/5', BAR)} />
        </div>
      )}
    </div>
  )
}

export interface EventSkeletonProps {
  /**
   * Draw Register and the action row in the flow. Off where the real ones pin to the screen's
   * foot (the phone sheet), which the skeleton then leaves clear.
   */
  actions?: boolean
}

/** A class's page body as it will arrive: its tags, when and where, then Register and actions. */
export function EventSkeleton({ actions = true }: EventSkeletonProps) {
  const { t } = useTranslation()

  return (
    <>
      <p className="sr-only" role="status">
        {t('common.chrome.loading', { defaultValue: 'Loading…' })}
      </p>
      <div aria-hidden className={clsx('flex flex-col gap-4 px-gutter pt-1 pb-10', PULSE)}>
        <div className="flex gap-1">
          <div className="h-5 w-24 rounded-full bg-gray-3" />
          <div className="h-5 w-16 rounded-full bg-gray-3" />
        </div>
        <div className="flex flex-col gap-3">
          {['w-3/5', 'w-1/2'].map((width) => (
            <div key={width} className="flex items-center gap-3">
              <div className="h-5 w-5 shrink-0 rounded-full bg-gray-3" />
              <div className={clsx('h-4', BAR, width)} />
            </div>
          ))}
        </div>
        {actions && (
          <>
            <div className="h-11 rounded-lg bg-gray-3" />
            <div className="flex gap-2">
              <div className="h-10 flex-1 rounded-lg bg-gray-3" />
              <div className="h-10 flex-1 rounded-lg bg-gray-3" />
            </div>
          </>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <div className={clsx('h-5 w-1/3', BAR)} />
          <div className={clsx('h-3.5 w-full', BAR)} />
          <div className={clsx('h-3.5 w-4/5', BAR)} />
        </div>
      </div>
    </>
  )
}
