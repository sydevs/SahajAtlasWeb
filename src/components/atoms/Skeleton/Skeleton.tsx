import type { ReactNode } from 'react'

import clsx from 'clsx'

import { tv } from '@/styles/tv'

/**
 * The placeholder primitives the loading states are drawn with (`views/PanelSkeleton.tsx`): grey
 * lines at a text size's own height, and blocks for everything else.
 */

/**
 * Marks a loading placeholder. The phone sheet's fit (`useFitSnap`) holds its stop while one is in
 * the body, so the sheet moves once, when the content arrives.
 */
export const LOADING_ATTR = 'data-sy-loading'

/** Spread onto the element that wraps a placeholder. */
export const LOADING = { [LOADING_ATTR]: '' }

const SHAPE = 'rounded-full bg-gray-3'

export interface SkeletonProps {
  children: ReactNode
  className?: string
}

/**
 * A placeholder region: hidden from assistive tech, pulsing unless motion is reduced. A loading
 * state says "loading" once, in words, beside it — never once per bar.
 */
export function Skeleton({ children, className }: SkeletonProps) {
  return (
    <div aria-hidden className={clsx('motion-safe:animate-pulse', className)}>
      {children}
    </div>
  )
}

export interface SkeletonLineProps {
  /**
   * The text classes of the line it stands in for (`text-lg`, `text-sm leading-snug`). The line
   * then takes exactly that line's height, so the content lands where the bar was.
   */
  className?: string
  /** The bar's width, as a Tailwind width class. */
  width?: string
}

/** One line of text, at that text's own line height. */
export function SkeletonLine({ className, width = 'w-1/2' }: SkeletonLineProps) {
  return (
    <div className={clsx('flex items-center', className)}>
      {/* The zero-width space gives the line its real line box. */}
      {'\u200b'}
      <span className={clsx('h-[0.75em]', SHAPE, width)} />
    </div>
  )
}

const block = tv({ base: 'rounded-lg bg-gray-3' })

/** Any other shape — a flag's circle, a button's box — sized by the caller. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={block({ className })} />
}
