import type { ReactNode } from 'react'

import clsx from 'clsx'

import { Skeleton, SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'
import { EventFactsSkeleton } from '@/components/molecules/EventFacts/EventFactsSkeleton'

/** Shared with `EventDetails`, so the page's placeholder and the page cannot drift apart. */
export const DETAILS_BODY = 'flex flex-col gap-4 px-gutter pt-2'

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
