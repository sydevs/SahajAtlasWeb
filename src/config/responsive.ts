import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { useMediaQuery } from 'react-responsive'

/**
 * # Responsive signals — and which question each one answers
 *
 * This widget is embedded in layouts we don't own, so "how big is the screen" and "how big
 * are WE" are different questions, and most of the app wants the second one (issue #107).
 * Every responsive decision in the app now names which of three signals it reads. The table
 * — behaviour by behaviour, with the reason — is in `.claude/rules/components.md`; this is
 * the mechanism, and `responsive.test.ts` is what stops a call site drifting off it.
 *
 *  - **container** (`useIsWide` / `useIsWideWidget`) — a fit question. Does a 22rem side
 *    panel leave usable space beside it? Does a short sheet scroll the CTA away? A 320px
 *    column on a 1600px desktop must answer these the way a phone does.
 *  - **viewport** (`useIsWideViewport`) — for the one thing that genuinely is the screen:
 *    the map camera padding, since a map only exists in map mode, and in map mode the
 *    widget IS the viewport (see below).
 *  - **input** (`useCoarsePointer`) — for affordances that depend on the DEVICE rather than
 *    on the space: whether `tel:` reaches a dialer. Narrowing a desktop window has never
 *    given it a phone.
 *
 * ## Why the container signal is a strict generalization, not a behaviour change
 *
 * In **map mode** the widget has no container to measure, by construction: the theme root
 * is `display: contents`, the map canvas is `position: fixed; inset: 0` and every drawer is
 * `fixed` too — so `<sahaj-atlas>` has no box at all and the widget occupies the viewport
 * whatever slot the host put it in. (That is a documented REQUIREMENT of map mode, not an
 * oversight — see the comment on the map container in `App.tsx`.) With nothing to observe,
 * `useIsWide` falls through to the viewport and returns exactly the answer `useIsDesktop`
 * used to. In **map-less mode** the host sizes the element and the widget fills its slot,
 * so there is a real box, and that box is what the app now reads.
 */

/**
 * The single width crossing in the app, in px — the old `breakpoints.md`, which was the
 * only one of the five ever consumed. Below it the drawer is a bottom sheet with a drag
 * handle and a snap ladder; at or above it, an anchored side panel.
 *
 * It stays a number rather than a Tailwind screen name because it is read by JS (a
 * ResizeObserver measures px, not media queries) and because a container query and a
 * media query would otherwise have to be kept in agreement by hand. Tailwind's own `md:`
 * variants still key off the viewport and are unaffected; the rule file says which of them
 * that is a problem for.
 */
export const WIDE_MIN_PX = 768

/**
 * How long a width has to hold before the app acts on it.
 *
 * The drawer direction remounts the drawer wrapper — vaul's `direction` is not
 * hot-swappable — so a surface resting near the crossing would otherwise thrash-remount:
 * a window dragged across 768px, or a host page animating a sidebar open. Only CHANGES are
 * damped; the first measurement commits immediately (see `useIsWide`).
 */
const SETTLE_MS = 200

// `useLayoutEffect` warns when React renders on the server, and the unit lane asserts
// components through `renderToStaticMarkup`. Effects don't run there at all, so the
// distinction is only about keeping that output warning-free.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Is the VIEWPORT wide? Read this only where the screen is genuinely the question. */
export function useIsWideViewport(): boolean {
  return useMediaQuery({ query: `(min-width: ${WIDE_MIN_PX}px)` })
}

/**
 * Is this a touch device — one that would actually dial a `tel:` link?
 *
 * `(pointer: coarse)` alone is true for a laptop with a touchscreen, which has a fine
 * pointer as well and is not a phone; pairing it with `(hover: none)` is the standard way
 * to ask for a device whose ONLY input is touch. Deliberately not a width test: a raw
 * `tel:` link is a dead end on a desktop no matter how narrow the widget's column is, and
 * a phone in landscape can be wider than the crossing.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery({ query: '(hover: none) and (pointer: coarse)' })
}

/**
 * Is the widget itself wide — measured, not inferred.
 *
 * Pass the widget's own layout root. Pass `null` when there isn't one (map mode), and the
 * viewport stands in; that is the same answer, because in map mode the widget spans the
 * viewport.
 *
 * **The first measurement is not damped, every later one is.** The seed runs in a layout
 * effect, so it lands before the browser paints and the correct model is on screen from
 * the first frame. Damping it instead would paint one frame of the viewport's answer and
 * then remount the drawer into the container's — which is precisely the remount `SETTLE_MS`
 * exists to prevent, fired on every mount rather than only on a resize.
 */
export function useIsWide(element: HTMLElement | null, delayMs = SETTLE_MS): boolean {
  const viewportWide = useIsWideViewport()
  // The container's answer, or null while there is nothing to measure.
  const [containerWide, setContainerWide] = useState<boolean | null>(null)
  const raw = containerWide ?? viewportWide
  const [stable, setStable] = useState(raw)

  useIsomorphicLayoutEffect(() => {
    // ResizeObserver is absent in jsdom and in the node lane; falling through to the
    // viewport there is the same graceful degradation `useMediaQuery` already gives us.
    if (!element || typeof ResizeObserver === 'undefined') {
      setContainerWide(null)

      return
    }

    // `offsetWidth`, NOT `getBoundingClientRect().width`, and the difference is not
    // pedantry: the rect is the TRANSFORMED box while the observer's `borderBoxSize` is the
    // untransformed layout box. Under a host that scales an ancestor — page builders and
    // "responsive preview" panes do — the two disagree, so seeding from the rect would read
    // one width at mount and a different one on the first unrelated resize, flipping the
    // whole interaction model for no reason the viewer can see. The layout box is also the
    // right answer on its own merits: a widget scaled to half size still lays itself out in
    // its own CSS pixels. `offsetWidth` rounds to an integer, which at this crossing is a
    // sub-pixel difference.
    const seed = element.offsetWidth >= WIDE_MIN_PX

    setContainerWide(seed)
    // Seeded past the damper too, so the first paint is already correct.
    setStable(seed)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) return
      // `borderBoxSize` to match the seed's `offsetWidth`; `contentRect` is the content box
      // and would move the crossing by whatever padding the element carries. Reading
      // `borderBoxSize` is spec-correct even though `observe()` uses the default content-box
      // option — that option chooses when a notification FIRES, not which sizes it reports.
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width

      setContainerWide(width >= WIDE_MIN_PX)
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  // One damper over both sources, so a viewport crossing in map mode is damped exactly as
  // it was before this hook existed.
  useEffect(() => {
    if (raw === stable) return

    const timer = setTimeout(() => setStable(raw), delayMs)

    return () => clearTimeout(timer)
  }, [raw, stable, delayMs])

  return stable
}

/**
 * The measured answer, shared with the subtree.
 *
 * `DrawerStack` owns the measurement (it renders the widget's layout root, and it needs the
 * answer before it can choose a direction), so descendants read it from here rather than
 * each mounting an observer of their own — and, more importantly, so they cannot disagree
 * with the drawer they are rendered inside. `null` means nobody is measuring, which is how
 * a Ladle story or a bare unit render behaves: they fall back to the viewport, exactly as
 * they did before this existed.
 */
export const WidgetWidthContext = createContext<boolean | null>(null)

/** Read the widget's own width class. See `WidgetWidthContext` for the no-provider case. */
export function useIsWideWidget(): boolean {
  const provided = useContext(WidgetWidthContext)
  // Called unconditionally (hook order), and it is the fallback rather than dead work: with
  // no provider above, this IS the answer.
  const fallback = useIsWide(null)

  return provided ?? fallback
}
