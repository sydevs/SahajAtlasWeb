import type { ReactNode } from 'react'

import clsx from 'clsx'

import { Skeleton, SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'
import { EventFactsSkeleton } from '@/components/molecules/EventFacts/EventFactsSkeleton'

/** Shared with `EventDetails`, so the page's placeholder and the page cannot drift apart. */
export const DETAILS_BODY = 'flex flex-col gap-4 px-gutter pt-2'

/** Shared with `EventHeader`. */
export const EVENT_HEADER = 'flex shrink-0 flex-col px-gutter pt-1 pb-2 md:pt-4'
export const EVENT_TITLE = 'line-clamp-3 text-xl break-words'

export interface EventDetailsSkeletonProps {
  /**
   * Draw Register and the action row in the flow, as `EventDetails`' own `ctaInline` does. Off
   * where they pin to the sheet's foot, which then stands below the placeholder already.
   */
  ctaInline?: boolean
  /**
   * The chips and facts, real, where the class is already known and only the page's code is on
   * its way. They stand where the placeholders would.
   */
  head?: ReactNode
}

/**
 * `EventDetails` before its class (or its code) has arrived: the chips, the when and where with
 * their real icons, Register and the action row, then the About heading over a few lines.
 */
export function EventDetailsSkeleton({ ctaInline = true, head }: EventDetailsSkeletonProps) {
  return (
    // Each band pulses on its own box: a `contents` wrapper draws no box for the pulse to fade.
    <div className={clsx(DETAILS_BODY, 'pb-10')}>
      {head ?? (
        <>
          <Skeleton className="flex gap-1">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-16" />
          </Skeleton>
          <Skeleton className="mb-2">
            <EventFactsSkeleton />
          </Skeleton>
        </>
      )}
      {ctaInline && (
        <>
          <Skeleton>
            <SkeletonBlock className="h-10 w-full" />
          </Skeleton>
          <Skeleton className="flex w-full justify-center gap-2 py-1">
            {[0, 1].map((column) => (
              <div key={column} className="flex w-[96px] flex-col items-center gap-1.5">
                <SkeletonBlock className="h-12 w-12 rounded-full" />
                <SkeletonLine
                  className="w-full justify-center text-xs leading-tight"
                  width="w-14"
                />
              </div>
            ))}
          </Skeleton>
        </>
      )}
      <Skeleton className="flex flex-col gap-2">
        <SkeletonLine className="text-base font-semibold" width="w-1/4" />
        <SkeletonLine className="text-sm leading-snug" width="w-full" />
        <SkeletonLine className="text-sm leading-snug" width="w-4/5" />
      </Skeleton>
    </div>
  )
}

export interface EventHeaderSkeletonProps {
  /** The row above the title: the way back, which works before the class arrives. */
  nav?: ReactNode
  /** The class's name where something already holds it (a list it was opened from). */
  title?: string
}

/** `EventHeader` before its class is known: the real way back, then the title or its lines. */
export function EventHeaderSkeleton({ nav, title }: EventHeaderSkeletonProps) {
  return (
    <div className={EVENT_HEADER}>
      {nav}
      {title ? (
        <h1 className={EVENT_TITLE}>{title}</h1>
      ) : (
        <Skeleton>
          <SkeletonLine className="text-xl" width="w-4/5" />
          <SkeletonLine className="text-xl" width="w-2/5" />
        </Skeleton>
      )}
    </div>
  )
}
