import { type ReactNode, useEffect, useRef, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { WIDGET_SCOPE_CLASS } from '@/lib/scope'
import { tv } from '@/styles/tv'

// A row that opens to show more, for content most visitors never need. Radix owns
// `aria-expanded`, `aria-controls` and the open state. The panel is unmounted while closed, so
// what it holds (and anything it loads) waits until someone opens it.
const disclosure = tv({
  slots: {
    root: 'border-t border-divider',
    trigger:
      'group touch-target relative flex min-h-14 w-full items-center justify-between gap-3 text-start text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus',
    chevron: 'shrink-0 text-gray-11 transition-transform group-data-[state=open]:rotate-180',
    panel: 'pb-4',
  },
})

export type DisclosureProps = {
  /** The row's label, always visible. */
  title: ReactNode
  /** What the row opens to. Mounted only while open. */
  children: ReactNode
  defaultOpen?: boolean
  /** Told on every open and close. */
  onOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * The nearest ancestor inside the widget that scrolls vertically and has something to scroll, or
 * none. Content alone is not enough: `overflow-x: hidden` computes `overflow-y` to `auto` too.
 */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.classList.contains(WIDGET_SCOPE_CLASS)) return null
    if (
      /(auto|scroll)/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node
    }
  }

  return null
}

/**
 * Scrolls `element`'s scroll container just far enough to show it, keeping its top in view if it
 * is taller than the container. Not `scrollIntoView`: that also scrolls every ancestor, the host
 * page included, and an embedded widget must never move the page around it.
 */
function reveal(element: HTMLElement, smooth: boolean) {
  const container = scrollParent(element)

  if (!container) return

  const box = element.getBoundingClientRect()
  const view = container.getBoundingClientRect()
  const below = box.bottom - view.bottom

  if (below <= 0) return

  container.scrollBy({
    top: Math.min(below, box.top - view.top),
    behavior: smooth ? 'smooth' : 'auto',
  })
}

export function Disclosure({
  title,
  children,
  defaultOpen,
  onOpenChange,
  className,
}: DisclosureProps) {
  const { root, trigger, chevron, panel } = disclosure()
  const [open, setOpen] = useState(defaultOpen ?? false)
  const rootRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // Opening reveals the row, and again whenever the panel grows while open (content that loads
  // after the click). Measured relative to the scroll container, so a sheet still sliding up
  // gives the same answer as one at rest.
  useEffect(() => {
    const element = rootRef.current

    if (!open || !element) return

    const observer = new ResizeObserver(() => reveal(element, !reducedMotion))

    observer.observe(element)

    return () => observer.disconnect()
  }, [open, reducedMotion])

  return (
    <Collapsible.Root
      ref={rootRef}
      className={root({ className })}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange?.(next)
      }}
    >
      {/* vaul reads a tap with any micro-movement as a drag and swallows the click. */}
      <Collapsible.Trigger data-vaul-no-drag className={trigger()}>
        {title}
        <ChevronDown aria-hidden className={chevron()} size={20} />
      </Collapsible.Trigger>
      <Collapsible.Content className={panel()}>{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
