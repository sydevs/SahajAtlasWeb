import { type ReactNode, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

export interface FoldSectionProps {
  title: ReactNode
  /** How many rows are inside. Shown so the visitor can judge a group before opening it. */
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

// The header, the rows and the scroll all share this, so they read as one movement. CSS and
// `glide` below hold the same curve, written once for each.
const FOLD_MS = 320
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** The nearest element that scrolls: the drawer body, never the host page around the widget. */
const scrollParent = (element: HTMLElement): HTMLElement | null => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)

    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }

  return null
}

// This is a frame loop, not `scrollTo({ behavior: 'smooth' })`. The rows are still opening when
// the press lands, so a smooth scroll would be clamped to the old, shorter height and stop short.
// Setting `scrollTop` each frame lets the browser re-clamp as the room appears.
const glide = (scroller: HTMLElement, to: number) => {
  const from = scroller.scrollTop
  const start = performance.now()

  const step = (now: number) => {
    const t = Math.min((now - start) / FOLD_MS, 1)

    scroller.scrollTop = from + (to - from) * easeOut(t)
    if (t < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

/**
 * A titled group of rows that folds. The whole header is one real button, so Enter and Space work
 * and the state is announced through `aria-expanded`. Its rows mount on the first opening, then
 * stay mounted. `visibility` takes them out of the tab order and the accessibility tree while
 * folded, so a closed group can't be tabbed into.
 *
 * Height moves through `grid-template-rows` (0fr to 1fr), which reaches a content height without
 * measuring it. The header is sticky while its rows are on screen, so a long open group can still
 * be closed from anywhere inside it.
 */
export function FoldSection({ title, count, open, onOpenChange, children }: FoldSectionProps) {
  const id = useId()
  const headerRef = useRef<HTMLButtonElement>(null)
  const reduced = usePrefersReducedMotion()
  const [everOpened, setEverOpened] = useState(open)

  const toggle = () => {
    const next = !open
    const header = headerRef.current
    const scroller = header && scrollParent(header)

    setEverOpened(true)
    onOpenChange(next)
    if (!header || !scroller) return

    // Bring an opening group up to the top when its rows would otherwise open out of sight, and
    // on closing from deep inside, return to the header's place in the list. On a phone the body
    // runs below the screen edge at the lower sheet heights, by `--sy-sheet-top`, so that much of
    // the body doesn't count as visible.
    const box = scroller.getBoundingClientRect()
    const top = header.getBoundingClientRect().top - box.top
    const hidden = parseFloat(getComputedStyle(scroller).getPropertyValue('--sy-sheet-top')) || 0
    const visible = box.height - hidden
    const target = scroller.scrollTop + top

    if ((next && top > visible * 0.45) || (!next && top <= 0)) {
      if (reduced) requestAnimationFrame(() => (scroller.scrollTop = target))
      else glide(scroller, target)
    }
  }

  return (
    <section className="border-t border-divider">
      <h3 className={clsx(open && 'sticky top-0 z-10 bg-background')}>
        <button
          ref={headerRef}
          aria-controls={id}
          aria-expanded={open}
          className="flex min-h-14 w-full items-center gap-2 bg-gray-2 px-gutter py-3 text-start text-lg font-semibold transition-colors outline-none hover:bg-primary-2 focus-visible:ring-2 focus-visible:ring-primary-8 focus-visible:ring-inset active:bg-primary-3 dark:hover:bg-gray-3 dark:active:bg-gray-4"
          type="button"
          onClick={toggle}
        >
          <span className="min-w-0 flex-grow">{title}</span>
          <span className="text-sm font-normal text-gray-11 tabular-nums">{count}</span>
          <ChevronDown
            aria-hidden
            className={clsx(
              'shrink-0 text-gray-10 transition-transform duration-[320ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
              open && 'rotate-180',
            )}
            size={20}
          />
        </button>
      </h3>
      <div
        className={clsx(
          'grid transition-[grid-template-rows,visibility] duration-[320ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
          open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
        )}
        id={id}
      >
        <div className="min-h-0 overflow-hidden">{(open || everOpened) && children}</div>
      </div>
    </section>
  )
}
