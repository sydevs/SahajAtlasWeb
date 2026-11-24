import { useEffect, useLayoutEffect, useState } from 'react'

import { getThemeRoot } from '@/hooks/use-theme'

/**
 * What the inline embed reads off, and writes onto, the HOST's page: its own element, the
 * host's header, the host's main heading, and the host's height rule. Kept apart from the view
 * so a spec can drive it in jsdom without the map.
 *
 * ⚠ Every read is guarded, like every host-DOM read in this app: hosts patch
 * `getBoundingClientRect` and friends, and a throw here would take the inline embed down with it.
 */

/** The `<sahaj-atlas>` element this widget renders in, or `null` standalone. */
export function hostElement(): HTMLElement | null {
  const root = getThemeRoot().getRootNode()

  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null
}

/**
 * How far down the host's own header reaches, in px. Two questions, because a header can be in
 * view now and scroll away, or be further down now and pin itself to the top later:
 *
 * - `now` — what covers the top of the window at this moment: where the expanded map starts.
 * - `stuck` — what pins itself to the top once the page scrolls: where the inline map sticks.
 *
 * The host states it with `--sahaj-atlas-header` on the element or any ancestor, which answers
 * both. Failing that, the widget looks for the header itself: a fixed or sticky bar, a `<header>`
 * or a `role="banner"`. Failing both, zero — the expanded map covers the whole screen.
 *
 * ⚠ Not the WordPress plugin's `--sahaj-atlas-top`, which is where the atlas element starts in
 * the document — the header's bottom only while nothing else sits between them.
 */
export function headerOffset(host: HTMLElement | null, when: 'now' | 'stuck'): number {
  try {
    const stated = parseFloat(
      getComputedStyle(host ?? document.documentElement).getPropertyValue('--sahaj-atlas-header'),
    )

    if (Number.isFinite(stated)) return Math.max(0, stated)

    const covers = when === 'now' ? coversNow : coversStuck

    return Math.round(Math.max(0, ...headerCandidates(host).map(covers)))
  } catch {
    return 0
  }
}

/**
 * `headerOffset(host, 'stuck')`, measured again when the window's width changes: a header's
 * height moves at the host's own breakpoints, never on a height-only resize such as a phone's
 * address bar collapsing.
 */
export function useStuckHeader(host: HTMLElement | null): number {
  const [offset, setOffset] = useState(() => headerOffset(host, 'stuck'))

  useEffect(() => {
    let width = window.innerWidth
    const measure = () => {
      if (window.innerWidth === width) return
      width = window.innerWidth
      setOffset(headerOffset(host, 'stuck'))
    }

    window.addEventListener('resize', measure)

    return () => window.removeEventListener('resize', measure)
  }, [host])

  return offset
}

/**
 * Where a header could be: whatever sits across the top edge of the window, the page's own
 * `<header>` and banner landmarks, and their ancestors, since the element that sticks is often a
 * wrapper. Never anything of the widget's own.
 */
function headerCandidates(host: HTMLElement | null): Element[] {
  const found = new Set<Element>()
  const climb = (start: Element | null) => {
    for (let element = start; element && element !== document.body; element = element.parentElement)
      found.add(element)
  }

  for (const fraction of [0.25, 0.5, 0.75])
    climb(document.elementFromPoint(window.innerWidth * fraction, 1))
  for (const landmark of document.querySelectorAll('header, [role="banner"]')) climb(landmark)

  return [...found].filter((element) => !host?.contains(element))
}

// A bar, not a takeover or a sidebar: most of the window's width, little of its height.
const isBar = (rect: DOMRect) =>
  rect.width >= window.innerWidth / 2 && rect.height < window.innerHeight * 0.4

function coversNow(element: Element): number {
  const rect = element.getBoundingClientRect()
  const { position } = getComputedStyle(element)
  const header =
    position === 'fixed' ||
    position === 'sticky' ||
    element.localName === 'header' ||
    element.getAttribute('role') === 'banner'

  return header && isBar(rect) && rect.top <= 1 && rect.bottom > 0 ? rect.bottom : 0
}

function coversStuck(element: Element): number {
  const { position, top } = getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  if (position !== 'fixed' && position !== 'sticky') return 0

  // `top: auto` pins nothing for a sticky element, and leaves a fixed one where it sits.
  const pinnedAt = top === 'auto' ? (position === 'fixed' ? rect.top : NaN) : parseFloat(top)

  return pinnedAt <= 1 && isBar(rect) ? Math.max(0, pinnedAt) + rect.height : 0
}

/**
 * Whether the host's page already has a main heading of its own, outside this element. A
 * server-rendered fallback inside `<sahaj-atlas>` is replaced by the widget, so it does not count.
 */
export function pageHasHeading(host: HTMLElement | null): boolean {
  try {
    return [...document.querySelectorAll('h1')].some((heading) => !host?.contains(heading))
  } catch {
    return false
  }
}

/**
 * Whether the content cannot reach the page: the host's box holds it in, or an ancestor clips
 * what grows past it — a site builder's frame, an app shell that never scrolls. An ancestor that
 * scrolls reaches it, so the search stops there.
 */
function cannotGrow(host: HTMLElement, content: HTMLElement): boolean {
  try {
    if (content.offsetHeight > host.clientHeight + 1) return true

    const bottom = host.getBoundingClientRect().bottom

    for (let ancestor = host.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const { overflowY } = getComputedStyle(ancestor)

      if (overflowY === 'auto' || overflowY === 'scroll') return false
      if (
        (overflowY === 'hidden' || overflowY === 'clip') &&
        ancestor.getBoundingClientRect().bottom < bottom - 1
      )
        return true
    }

    return false
  } catch {
    return false
  }
}

// What the host's own height rule is overridden with, so the inline embed is as tall as its
// content. Inline `!important` outranks any author rule.
const GROW = [
  ['max-height', 'none'],
  // A scroll container would also take the inline map's `sticky` away from the page.
  ['overflow', 'visible'],
] as const

/**
 * Lets the host element grow to fit, and says whether it could not (`boxed`).
 *
 * Where the content cannot reach the page, the element takes its box's full height instead, and
 * the content scrolls within it, so nothing is cut off and nothing spills over the page below.
 * Once boxed, it stays boxed: growing again would only clip again. The previous inline values come
 * back on unmount.
 */
export function useGrowHost(host: HTMLElement | null, content: HTMLElement | null): boolean {
  const [boxed, setBoxed] = useState(false)

  useLayoutEffect(() => {
    if (!host) return

    const style = host.style
    const grow: (readonly [string, string])[] = [...GROW, ['height', boxed ? '100%' : 'auto']]

    if (getComputedStyle(host).display === 'inline') grow.push(['display', 'block'])

    const before = grow.map(
      ([property]) =>
        [property, style.getPropertyValue(property), style.getPropertyPriority(property)] as const,
    )

    for (const [property, value] of grow) style.setProperty(property, value, 'important')

    return () => {
      for (const [property, value, priority] of before) {
        if (value) style.setProperty(property, value, priority)
        else style.removeProperty(property)
      }
    }
  }, [host, boxed])

  useLayoutEffect(() => {
    if (!host || !content || boxed || typeof ResizeObserver === 'undefined') return

    const check = () => {
      if (cannotGrow(host, content)) setBoxed(true)
    }
    const observer = new ResizeObserver(check)

    observer.observe(host)
    observer.observe(content)
    check()

    return () => observer.disconnect()
  }, [host, content, boxed])

  return boxed
}
