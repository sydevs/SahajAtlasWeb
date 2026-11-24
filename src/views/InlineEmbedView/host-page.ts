import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

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
    // Pixels only. A `4rem` read as 4 would put the expanded map over the header it names, so
    // anything else falls through to looking for the header.
    const stated = /^(\d*\.?\d+)(px)?$/.exec(
      getComputedStyle(host ?? document.documentElement)
        .getPropertyValue('--sahaj-atlas-header')
        .trim(),
    )

    if (stated) return Number(stated[1])

    const covers = when === 'now' ? coversNow : coversStuck

    return Math.round(Math.max(0, ...headerCandidates(host).map(covers)))
  } catch {
    return 0
  }
}

/**
 * `headerOffset`, while `active`, measured again — once a frame at most — when the window's width
 * changes: a header's height moves at the host's own breakpoints, never on a height-only resize
 * such as a phone's address bar collapsing.
 *
 * Measured in render, so the expanded map's first frame already starts below the header, rather
 * than covering the point the search reads.
 *
 * shortcut: a header that changes height without a width change (hiding on scroll, a dismissed
 * promo bar) keeps its old offset; a host with one states `--sahaj-atlas-header`. Observe the
 * header found, if a host ever needs more.
 */
export function useHeaderOffset(
  host: HTMLElement | null,
  when: 'now' | 'stuck',
  active = true,
): number {
  const [resized, setResized] = useState(0)

  useEffect(() => {
    if (!active) return

    let width = window.innerWidth
    let frame = 0
    const measure = () => {
      if (frame || window.innerWidth === width) return
      frame = requestAnimationFrame(() => {
        frame = 0
        width = window.innerWidth
        setResized((count) => count + 1)
      })
    }

    window.addEventListener('resize', measure)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [active])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `resized` re-runs the read on a width change
  return useMemo(() => (active ? headerOffset(host, when) : 0), [host, when, active, resized])
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

  return [...found].filter(
    (element) => !host || (!host.contains(element) && !element.contains(host)),
  )
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
    // A `<header>` inside sectioning content heads that section, not the page (HTML-AAM).
    (element.localName === 'header' && !element.closest('article, aside, main, nav, section')) ||
    element.getAttribute('role') === 'banner'

  return header && isBar(rect) && rect.top <= 1 && rect.bottom > 0 ? rect.bottom : 0
}

function coversStuck(element: Element): number {
  const { position, top } = getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  if (position !== 'fixed' && position !== 'sticky') return 0

  // `top: auto` pins nothing for a sticky element, and leaves a fixed one where it sits.
  const pinnedAt = top === 'auto' ? (position === 'fixed' ? rect.top : NaN) : parseFloat(top)

  // A header pinned partly above the window (one that retracts) covers only what shows of it.
  return pinnedAt <= 1 && isBar(rect) ? Math.max(0, pinnedAt + rect.height) : 0
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

// How long a clip must last before the embed boxes for good: longer than an accordion or tab
// panel takes to open, which clips everything inside it while it animates.
const CLIP_SETTLE_MS = 600

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
 * Once boxed, it stays boxed: growing again would only clip again. So only a clip still there once
 * the page has settled boxes it. The previous inline values come back on unmount.
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

    let settling: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      clearTimeout(settling)
      if (!cannotGrow(host, content)) return
      settling = setTimeout(() => {
        if (cannotGrow(host, content)) setBoxed(true)
      }, CLIP_SETTLE_MS)
    }
    const observer = new ResizeObserver(check)

    observer.observe(host)
    observer.observe(content)
    check()

    return () => {
      clearTimeout(settling)
      observer.disconnect()
    }
  }, [host, content, boxed])

  return boxed
}
