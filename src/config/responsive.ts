import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { useMediaQuery } from 'react-responsive'

/**
 * # Responsive signals, and which question each one answers
 *
 * This widget is embedded in layouts we do not own.
 * So "how big is the screen" and "how big are WE" are different questions, and most of the app wants the second one. See issue #107.
 * Every responsive decision in the app now names which of three signals it reads.
 * The table, behavior by behavior, with the reason, is in `src/components/AGENTS.md`.
 * This file is the mechanism, and `responsive.test.ts` stops a call site drifting off it.
 *
 *  - **container** (`useIsWide` / `useIsWideWidget`): this is a fit question.
 *    Does a 352px side panel leave usable space beside it? Does a short sheet scroll the CTA away?
 *    A 320px column on a 1600px desktop must answer these the way a phone does.
 *  - **viewport** (`useIsWideViewport`): this is for the case where the screen genuinely is the question.
 *    It has no app call sites left. The map camera padding was the last one, and #169 moved it to the container signal,
 *    because a contained map's frame and the viewport stopped being the same box.
 *    It survives as `useIsWide`'s own fallback, which is how a widget with nothing to measure still gets the right answer,
 *    and in a Ladle story, where the viewport really is the container.
 *  - **input** (`useCoarsePointer`, `useHasRealPointer`): this is for affordances that depend on the DEVICE, not the space, such as whether `tel:` reaches a dialer.
 *    Narrowing a desktop window has never given it a phone.
 *
 * ## Why the container signal is a strict generalization, not a behavior change
 *
 * In an UNBOXED map embed, the widget has no container to measure, by construction.
 * The theme root is `display: contents`, the map canvas is `position: fixed; inset: 0`, and every drawer is `fixed` too.
 * So `<sahaj-atlas>` has no box at all, and the widget occupies the viewport, whatever slot the host put it in.
 * With nothing to observe, `useIsWide` falls through to the viewport, and returns exactly the answer `useIsDesktop` used to.
 * In MAP-LESS mode, the host sizes the element and the widget fills its slot.
 * So there is a real box, and that box is what the app now reads.
 *
 * **Map mode can have a box too, since #169.**
 * That box is a `MapFrame` where the host sized the element, or the compact card's expanded dialog.
 * Both take the containing block with `contain: layout`.
 * So the panel a fit question is asking about is genuinely inside them.
 * `frameElement()`, in `lib/overlay.ts`, is what that box is passed as, and `null` there still means the viewport.
 */

/**
 * This is the single width crossing in the app, in px.
 * It is the old `breakpoints.md` value, the only one of the five ever consumed.
 * Below it, the drawer is a bottom sheet with a drag handle and a snap ladder.
 * At or above it, the drawer is an anchored side panel.
 *
 * This stays a number, not a Tailwind screen name.
 * JS reads it, and a ResizeObserver measures px, not media queries.
 * A container query and a media query would otherwise have to be kept in agreement by hand.
 * Tailwind's own `md:` variants still key off the viewport, and stay unaffected.
 * The rule file says which of them that is a problem for.
 */
export const WIDE_MIN_PX = 768

/**
 * This is how long a width has to hold before the app acts on it.
 *
 * The drawer direction remounts the drawer wrapper, since vaul's `direction` is not hot-swappable.
 * So a surface resting near the crossing would otherwise thrash-remount, such as a window dragged across 768px, or a host page animating a sidebar open.
 * This damps only CHANGES. The first measurement commits immediately. See `useIsWide`.
 */
const SETTLE_MS = 200

// `useLayoutEffect` warns when React renders on the server.
// The unit lane asserts components through `renderToStaticMarkup`.
// Effects never run there at all, so this distinction only keeps that output warning-free.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** This checks whether the VIEWPORT is wide. Read this only where the screen is genuinely the question. */
export function useIsWideViewport(): boolean {
  return useMediaQuery({ query: `(min-width: ${WIDE_MIN_PX}px)` })
}

/**
 * This checks whether this is a touch device, one that would actually dial a `tel:` link.
 *
 * `(pointer: coarse)` alone is true for a laptop with a touchscreen, which also has a fine pointer and is not a phone.
 * Pairing it with `(hover: none)` is the standard way to ask for a device whose ONLY input is touch.
 * This is deliberately not a width test.
 * A raw `tel:` link is a dead end on a desktop, no matter how narrow the widget's column is.
 * A phone in landscape can also be wider than the crossing.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery({ query: TOUCH_ONLY_QUERY })
}

/** A device whose only input is touch. `globals.css`'s `touch-target` restates it in CSS. */
export const TOUCH_ONLY_QUERY = '(hover: none) and (pointer: coarse)'

// The phone sheet's two pixel stops, read by DrawerStack for the sheet and by the camera for the
// map it covers. The peek is the handle's 28px, the 32px Back row, the 8px under it (NavRow's
// `mb-2`), a 26px title line and room to spare: at 88px the title's lower half fell off the
// screen. The open stop shows the Back row, the title, a list row, and a peek of the next.
export const SHEET_PEEK_PX = 104
export const SHEET_OPEN_PX = 356
// The first screen opens taller than the open stop: its title, the search with its location line,
// online classes and the browse heading come before the first country, which must still show.
// Measured at 390×844: the first country row ends 346px into the sheet, so 380px shows it and a
// peek of the next, as the open stop does for other views.
export const SHEET_HOME_PX = 380

// On a phone on its side, the open and taller stops covered nearly all of a 375px-tall map. There
// every pixel stop stays this far below the top of the window, the band of map a 300px open stop
// left on such a screen.
// shortcut: this is under the 160px the camera reserves above the sheet for a pin it just framed
// (`MIN_MAP_STRIP_PX`), so on a short window a framed pin can land under the sheet. Raise it to
// the camera's reserve once the landscape sheet has been measured on a phone.
const ABOVE_SHEET_WHEN_SHORT_PX = 75

/** Where a short window caps the frameless phone sheet's pixel stops (`useIsShortViewport`). */
export const shortSheetCap = (): number =>
  Math.max(SHEET_PEEK_PX, window.innerHeight - ABOVE_SHEET_WHEN_SHORT_PX)

// The sheet's third stop, as a share of the box vaul measures against: near full, with the last
// 3% left showing. The boot panel stands at the sheet's stops before vaul exists, and `useFitSnap`
// calls content this tall full, so a copy in any of the three would drift from the sheet itself.
export const WIDE_SNAP = 0.97

// What a phone sheet must still leave of the map above it, for the pin the camera just framed, and
// for the map's control column. It also keeps the camera's padding inside a short contained embed
// (#169), where padding past the canvas makes `fitBounds` refuse the fit outright.
export const MIN_MAP_STRIP_PX = 160

/** A pixel stop held down to `cap`. Fractions, and every stop when there is no cap, pass through. */
export const capStop = <T extends number | string | null>(
  point: T,
  cap: number | null,
): T | string =>
  cap !== null && typeof point === 'string' && parseFloat(point) > cap ? `${cap}px` : point

/**
 * Whether the window is a phone on its side, or as short. It reads the viewport on purpose: the
 * frameless phone sheet asks, and that sheet is measured against the window too; and the map's
 * control column turns into a row on the same answer, so the row and that sheet's capped top
 * cannot disagree.
 */
export function useIsShortViewport(): boolean {
  return useMediaQuery({ query: '(max-height: 480px)' })
}

/** The device has a real pointer that can rest on something, so hover can carry content. */
export const REAL_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

/**
 * This checks for a mouse or trackpad, the opposite question to `useCoarsePointer`.
 *
 * Anything revealed on hover needs this gate. iOS sends a fake mouse move before a tap, and when
 * that reveals content Safari treats the tap as a hover and doesn't click.
 */
export function useHasRealPointer(): boolean {
  return useMediaQuery({ query: REAL_POINTER_QUERY })
}

/**
 * This checks whether the widget itself is wide, measured, not inferred.
 *
 * Pass the widget's own layout root: the map-less container, or map mode's frame.
 * Pass `null` when there is none, such as an unboxed map embed. The viewport then stands in.
 * That is the same answer, because such an embed spans the viewport.
 *
 * **Measuring a new element is not damped. A change of width is.**
 * The seed runs in a layout effect, so it lands before the browser paints, and the correct model is on screen from the first frame.
 * Damping it instead would paint one frame of the viewport's answer, then remount the drawer into the container's answer.
 * That is precisely the remount `SETTLE_MS` exists to prevent, and it would fire on every mount, not only on a resize.
 * The same argument applies to every change of `element` IDENTITY, not only the first.
 * `DrawerStack`'s node stays stable for the session, so in practice it is the first.
 */
export function useIsWide(element: HTMLElement | null, delayMs = SETTLE_MS): boolean {
  const viewportWide = useIsWideViewport()
  // This is the container's answer, or null while there is nothing to measure.
  const [containerWide, setContainerWide] = useState<boolean | null>(null)
  const raw = containerWide ?? viewportWide
  const [stable, setStable] = useState(raw)

  useIsomorphicLayoutEffect(() => {
    // `ResizeObserver` is absent in jsdom and in the node lane.
    // Falling through to the viewport there gives the same graceful degradation `useMediaQuery` already gives us.
    if (!element || typeof ResizeObserver === 'undefined') {
      setContainerWide(null)

      return
    }

    // This reads `offsetWidth`, NOT `getBoundingClientRect().width`. The difference is not pedantry.
    // The rect is the TRANSFORMED box. The observer's `borderBoxSize` is the untransformed layout box.
    // Under a host that scales an ancestor, such as a page builder or a "responsive preview" pane, the two disagree.
    // So seeding from the rect would read one width at mount and a different one on the first unrelated resize.
    // That would flip the whole interaction model for no reason the viewer can see.
    // The layout box is also the right answer on its own merits.
    // A widget scaled to half size still lays itself out in its own CSS pixels.
    // `offsetWidth` rounds to an integer, which at this crossing is a sub-pixel difference.
    const seed = element.offsetWidth >= WIDE_MIN_PX

    setContainerWide(seed)
    // This also seeds past the damper, so the first paint is already correct.
    setStable(seed)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) return
      // This reads `borderBoxSize` to match the seed's `offsetWidth`.
      // `contentRect` is the content box, and it would move the crossing by whatever padding the element carries.
      // Reading `borderBoxSize` is spec-correct, even though `observe()` uses the default content-box option.
      // That option chooses when a notification FIRES, not which sizes it reports.
      // The `contentRect` fallback exists for an engine too old to report `borderBoxSize`, and it does reintroduce that mismatch.
      // This accepts that fallback because the observed node carries no padding or border, so the two coincide there.
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width

      setContainerWide(width >= WIDE_MIN_PX)
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  // This is one damper over both sources.
  // So a viewport crossing in map mode damps exactly as it did before this hook existed.
  useEffect(() => {
    if (raw === stable) return

    const timer = setTimeout(() => setStable(raw), delayMs)

    return () => clearTimeout(timer)
  }, [raw, stable, delayMs])

  return stable
}

/**
 * This is the measured answer, shared with the subtree.
 *
 * One owner measures it: on a map, `MapboxControllerProvider`, which wraps the map and `DrawerStack` alike and measures the frame both sit in; map-less, `DrawerStack`, which renders the widget's layout root and needs the answer before it can choose a direction.
 * So descendants read it from here, instead of each mounting an observer of their own.
 * More importantly, this means they cannot disagree with the drawer they are rendered inside.
 * `null` means nobody is measuring, which is how a Ladle story or a bare unit render behaves.
 * They fall back to the viewport, exactly as they did before this existed.
 */
export const WidgetWidthContext = createContext<boolean | null>(null)

/** This reads the widget's own width class. See `WidgetWidthContext` for the no-provider case. */
export function useIsWideWidget(): boolean {
  const provided = useContext(WidgetWidthContext)
  // This reads the raw viewport, instead of `useIsWide(null)`, which would give the same answer through two effects and a timer.
  // Damping exists to stop the drawer REMOUNTING on a width that has not settled.
  // Nothing reading this outside a provider remounts on it, so the fallback path has nothing to damp, and paying for it on every consumer buys nothing.
  // This call runs unconditionally, for hook order. With no provider above, this IS the answer.
  const fallback = useIsWideViewport()

  return provided ?? fallback
}
