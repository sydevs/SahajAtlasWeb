import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Drawer as Vaul } from 'vaul'

import { isIOS, useSheetDragClaim } from './sheet-touch'

import { tv, type VariantProps } from '@/styles/tv'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { overlayContainer } from '@/lib/overlay'

// A drawer built on vaul (see issue #30). It uses a tailwind-variants slot set,
// portaled into the themed widget root through `overlayContainer()`. It is
// non-modal by default, so the map and content behind it stay interactive. The
// pinned `vaul@1.1.2` patch (see `patches/`) forwards `modal` to Radix. So
// non-modal is *truly* non-modal: no background `aria-hidden`, and no focus
// trap.
//
// `DrawerStack` renders a SINGLE drawer, holding the active (top) view. Parent
// views appear as static peek cards behind it, not real nested drawers.
// Direction is left at ≥md, and bottom on mobile. `snapPoints` are the mobile
// peek, third, and full ladder. A map-less atlas renders no drawer at all: its
// views sit in the inline embed's column, in `DrawerSlotsProvider mode="inline"`.

export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

// Marks a band hosting a `SearchField`: the suggestion list runs from the field to the band's
// end (`MapSearch` measures it), since a dropdown narrower than the band left the list's counts
// peeking out beside it. This belongs to the bands rather than the views that mount a field,
// which drifted: the error chrome mounts a live field (`views/fallbacks.tsx`).
export const RESULTS_BAND = 'sy-results-band'

const drawer = tv({
  slots: {
    // ⚠ Clip, never hidden — `components/AGENTS.md` carries why (#326). The panel's own
    // overflow is vaul's `::after` filler, which no view creates and none can decline, so
    // this one belongs on the atom. Measured at 390×844: `scrollTop: 762` before it.
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-clip bg-background text-foreground shadow-2xl outline-none',
    // Every content band is capped at `--sy-content-max` (default 512px) and
    // centred. So on a wide surface, such as a large-mobile bottom sheet, the
    // views read as a centred column, instead of stretching edge to edge. This
    // has no effect on the 352px anchored panel, which is already narrower.
    // ⚠ The wider gap and bottom padding on a touch screen are the 44px tap floor, not
    // spacing taste (#432): the header's controls are drawn at 32px and each grows an
    // invisible 44px area, 6px past its own box on every side. At the 8px gap two of those
    // areas overlapped, the later control took the shared pixels, and every control but the
    // last measured 40px wide. The room is what lets each one have its own.
    header: `${RESULTS_BAND} mx-auto flex w-full max-w-[var(--sy-content-max,512px)] shrink-0 items-center gap-2 px-gutter pt-4 pb-2 pointer-coarse:gap-3 pointer-coarse:pb-3`,
    // A second fixed band under the header, for controls that act on the
    // scrolling content below, such as SearchView's Filters and Sort. It
    // shares the header's width cap and `shrink-0`. It sits OUTSIDE the body,
    // so a long list scrolls under it instead of carrying it away. That is
    // exactly when those controls become useful.
    toolbar: 'mx-auto w-full max-w-[var(--sy-content-max,512px)] shrink-0',
    // `overscroll-y-none` stops a list's scroll, flung to its end, chaining into Safari's page
    // pull. `useSheetDragClaim` handles the slow drag that starts at the top.
    // `overflow-x-hidden` is a backstop, not the fix. A drawer is a
    // fixed-width panel and must never scroll sideways. But it renders
    // host-authored prose, so one unbreakable string could always overflow
    // it. Content wraps at the source instead (see EventDetails'
    // `break-words`). This class only means the next such string degrades to
    // a clipped edge, instead of a horizontal scrollbar across the view. It
    // is safe for the full-bleed carousel, which is exactly the body's width,
    // and for popovers, which portal out of the body entirely.
    // The trailing spacer clears a `sticky` footer, which is out of flow, so
    // the body runs underneath it and the end of the content is otherwise
    // unreachable. The length is the footer's own, published by `DrawerFooter`,
    // and zero wherever no sticky footer exists.
    // ⚠ A spacer and not this slot's own `pb-*`: tailwind-merge drops a slot
    // `pb-*` for any caller shorthand, and four bodies already pass `py-4`, so
    // the first of them to gain a sticky footer would bury its own content with
    // every lane green. A variant-prefixed class conflicts with no caller
    // class, and the spacer adds to their padding instead of replacing it. It
    // is a pseudo-element so `[&>:last-child]` postures still find the real
    // last child (`CENTERED_BODY`).
    body: "mx-auto min-h-0 w-full max-w-[var(--sy-content-max,512px)] flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none after:block after:h-[var(--sy-footer-h,0px)] after:shrink-0 after:content-['']",
    footer:
      'mx-auto mt-auto w-full max-w-[var(--sy-content-max,512px)] shrink-0 border-t border-gray-4',
    // This themes the vaul drag handle. Its vendored CSS hardcodes a light
    // grey. This gives the handle breathing room from the sheet's rounded top
    // edge, but keeps it close to the header below. It also adds a grab
    // cursor, so the drag affordance reads on pointer devices.
    handle: 'mt-2.5 mb-1 cursor-grab !bg-gray-7 active:cursor-grabbing',
  },
  variants: {
    direction: {
      // Flush to the edge on tablet (md–lg). At ≥lg it floats with a margin, so
      // the map shows around it, rounded.
      //
      // TODO(rtl, #52 WS8): the remaining RTL gap is vaul's own `direction`
      // prop. That prop is physically left or right, and it drives both the
      // drag axis and the enter animation. These inset classes cannot fix
      // that alone. DrawerStack picks the direction, so the flip belongs
      // there and here together — and with the map's control column, which is
      // physically `top-right` (`organisms/Mapbox/MapControls.tsx`). This is
      // deferred until an RTL locale actually ships. Everything else here is
      // already logical: the stack's panel positioning uses `start-*`, and
      // directional icons carry `rtl:-scale-x-100` at their call sites.
      //
      // The left inset is the notch or Dynamic Island of a phone held sideways (`viewport-fit=cover`
      // runs the page under it). The panel widens by the inset and pads it, so its content keeps
      // the full width clear of the cut-out. Zero everywhere else.
      //
      // **The `352px` in both variants below is paired with `DRAWER_W_PX` in
      // `hooks/use-map-controller-real.tsx`.** That constant becomes the map's
      // left camera padding, so the map knows how much of itself this panel
      // covers. Tailwind needs a literal here, and it cannot read the
      // constant. So changing this width means changing that one in the same
      // edit. Otherwise the map keeps framing around the old width, and
      // nothing anywhere reports the drift.
      // Floating (≥lg), the panel is as tall as its view, up to the frame's height less its
      // margins. While someone is typing in the place search it takes the full height, since the
      // suggestions open inside it and it clips. Keyed on the typing, not on the list being open:
      // Mapbox opens and closes the list on every response, and the panel would follow each one.
      left: {
        content:
          'inset-y-0 left-0 w-[calc(var(--sy-drawer-w,352px)+env(safe-area-inset-left,0px))] max-w-[calc(100%-32px)] rounded-none border border-divider ps-[env(safe-area-inset-left,0px)] lg:top-4 lg:bottom-auto lg:left-4 lg:max-h-[calc(var(--sy-frame-h)-32px)] lg:rounded-2xl lg:has-[[role=search]:focus-within_input:not(:placeholder-shown)]:h-[calc(var(--sy-frame-h)-32px)]',
      },
      right: {
        content:
          'inset-y-0 right-0 w-[var(--sy-drawer-w,352px)] max-w-[calc(100%-32px)] rounded-none border border-divider lg:inset-y-4 lg:right-4 lg:rounded-2xl',
      },
      // Snap-point sheets must use the full viewport height. Vaul computes
      // its snap translate from the window height, so a content-sized sheet
      // would get pushed off-screen. The 3dvh bottom padding keeps the
      // footer above the fold at the 0.97 top snap, since the last 3% stays
      // hidden.
      bottom: {
        content:
          'inset-x-0 bottom-0 h-[var(--sy-frame-h)] rounded-t-2xl border-t border-divider pb-[calc(var(--sy-frame-h)*0.03)]',
      },
      top: {
        content: 'inset-x-0 top-0 h-[var(--sy-frame-h)] rounded-b-2xl border-b border-divider',
      },
    },
    // How the panel relates to the page: a drawer over the map, or no drawer at all.
    mode: {
      /** Fixed to the viewport, anchored to the `direction` edge. This is the map layout. */
      anchored: {},
      /**
       * In the host page's flow, with no drawer at all: the inline embed's content column.
       * Nothing scrolls inside it, so the page grows to fit. The column lifts the bands' width
       * cap itself, through `--sy-content-max`.
       */
      inline: {
        body: 'flex-none overflow-visible after:hidden',
        // A title naming the place the inline embed's page heading already names gives way to
        // that heading. `display: none` takes it out of the accessibility tree too, so this is
        // the same tree as not rendering it (`DrawerTitle`, `views/shared.tsx`).
        header: '[&_[data-sy-place]]:hidden',
      },
    },
    // A full-width surface, such as CalendarView, instead of the 352px
    // left panel, so a month grid stays legible. This only matters with
    // the anchored `left` panel, in map mode at ≥md. The bottom sheet is
    // already full-width, so it ignores this variant (see the compound below).
    wide: { true: {}, false: {} },
  },
  compoundVariants: [
    // The bottom sheet shows a drag handle that already spaces the header
    // from the sheet's top edge. So this relaxes the header's top padding,
    // for a balanced handle-to-header gap.
    { direction: 'bottom', mode: 'anchored', class: { header: 'pt-2' } },
    // Wide, plus the anchored left panel: this fills the container, flush at
    // md and floating at lg, instead of the narrow left panel. `!important`
    // overrides the left variant's fixed width and edge insets.
    {
      direction: 'left',
      mode: 'anchored',
      wide: true,
      class: { content: '!inset-0 !w-auto !max-w-none lg:!inset-4' },
    },
  ],
  defaultVariants: { direction: 'bottom', mode: 'anchored', wide: false },
})

type DrawerSlots = ReturnType<typeof drawer>

type DrawerMode = 'anchored' | 'inline'

type DrawerCtx = {
  slots: DrawerSlots
  direction: DrawerDirection
  mode: DrawerMode
  wide?: boolean
  // The portal target for a real drawer.
  container?: HTMLElement | null
}

const DrawerContext = createContext<DrawerCtx>({
  slots: drawer({ direction: 'bottom' }),
  direction: 'bottom',
  mode: 'anchored',
})

const useDrawerSlots = () => useContext(DrawerContext)

// A real drawer is anchored. `inline` is a surface with no drawer at all, reached only through
// `DrawerSlotsProvider`.
export type DrawerProps = Omit<VariantProps<typeof drawer>, 'mode'> & {
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Non-modal by default. The map and content behind it stay interactive. */
  modal?: boolean
  /** When false, the drawer cannot be closed by swipe, Esc, or clicking outside. */
  dismissible?: boolean
  /** Restricts dragging to the handle. When no handle renders (the left panel),
   *  this makes the drawer undraggable, but the close button still dismisses it. */
  handleOnly?: boolean
  /** Mobile snap points, e.g. `['96px', '336px', 0.97]`. */
  snapPoints?: (number | string)[]
  activeSnapPoint?: number | string | null
  setActiveSnapPoint?: (snapPoint: number | string | null) => void
  /** The portal target. The default is the theme root. */
  container?: HTMLElement | null
  /**
   * The box vaul measures snap points against. **This is not the same
   * question as `container`.** Conflating the two inverts the sheet. See the
   * note on `rootProps` below. Omit this prop to measure the window instead,
   * which is right for every mount outside a frame.
   */
  measureAgainst?: HTMLElement | null
  children: ReactNode
}

/** The drawer root. Provides direction and slots to the DrawerContent subtree. */
export function Drawer({
  open,
  onOpenChange,
  direction = 'bottom',
  modal = false,
  dismissible = true,
  handleOnly = false,
  wide = false,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  container,
  measureAgainst,
  children,
}: DrawerProps) {
  const slots = drawer({ direction, mode: 'anchored', wide })

  // This passes the snap props unconditionally. `undefined` means no snap
  // points. This lets the WithFadeFrom/WithoutFadeFrom discriminated union
  // resolve cleanly.
  const rootProps = {
    // ⚠ Vaul measures the CONTAINER when given one, and `window.innerHeight`
    // otherwise (`snapPointsOffset`, vaul dist). Passing one is what makes a
    // fractional snap point correct inside the expanded dialog, which starts
    // below the host's header and so is shorter than the window. Without
    // this prop, the near-full snap sat that far out, and the sheet overran
    // the clip edge.
    //
    // ⚠ **But it must be a box, and the portal target is not always one.**
    // This code briefly passed `container`, the element this drawer portals
    // into, on the reasoning that measuring the box it renders in cannot be
    // wrong. Embedded, that element is the theme root, which is `display:
    // contents` (`Widget.tsx`) and therefore measures **0×0**. Standalone, it
    // is `<html>`, which in map mode holds nothing but `position: fixed`
    // children, and measured **195px against an 844px viewport**. Every snap
    // offset is `containerSize.height - height`. So at zero, the ladder
    // `['80px','300px',0.97]` becomes `[-80,-300,0]` instead of
    // `[764,544,25]`. The sheet then translates UP off the bottom and covers
    // the top of the screen. That is the default phone experience of a map
    // embed, and lint, typecheck, and all 1263 unit specs stayed green
    // through it.
    //
    // So the measurement box is its own prop. `DrawerStack` supplies
    // `frameElement()`: the expanded dialog. It supplies `undefined` wherever
    // there is no frame, and that is where vaul's own `window.innerHeight` is
    // correct.
    container: measureAgainst ?? undefined,
    direction,
    dismissible,
    handleOnly,
    modal,
    // ⚠ Off on iOS ALONE, so there Safari is the only thing that moves the page for the keyboard.
    // Vaul's handling writes the sheet's `bottom` and `height` from the keyboard height plus the
    // active snap offset, and tracks whether the keyboard is open by toggling a flag on each large
    // viewport change. On iOS that flag goes out of step after the first close: the next focus
    // threw the sheet off the top of the screen, and closing left a sheet-shaped ghost over the
    // map. Seen on iOS 18.5 and 26.3. Everywhere else a keyboard shrinks the visual viewport and
    // this handling is what lifts a focused field clear of it, so it stays on — nothing here
    // replaces it. The flag also gates vaul's `usePreventScroll`, whose body runs on iOS only.
    repositionInputs: !isIOS(),
    open,
    onOpenChange,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    children,
  }

  return (
    <DrawerContext.Provider
      value={{ slots, direction: direction ?? 'bottom', mode: 'anchored', wide, container }}
    >
      <Vaul.Root {...rootProps} />
    </DrawerContext.Provider>
  )
}

/**
 * Establishes the drawer slot context (the header/body/footer padding for a given
 * mode plus direction) WITHOUT a vaul root, so a view's `Drawer*` subtree can be
 * previewed outside a real drawer (the story harness) with the SAME chrome the app
 * renders. The app itself always goes through `<Drawer>`/`<DrawerContent>`. This is
 * only for rendering the inner content standalone, and for the inline embed's column.
 */
export function DrawerSlotsProvider({
  mode = 'anchored',
  direction = 'bottom',
  children,
}: {
  mode?: DrawerMode
  direction?: DrawerDirection
  children: ReactNode
}) {
  return (
    <DrawerContext.Provider value={{ slots: drawer({ direction, mode }), direction, mode }}>
      {children}
    </DrawerContext.Provider>
  )
}

export type DrawerContentProps = {
  /** The accessible name for the dialog. Radix requires one. It renders sr-only. */
  'aria-label': string
  children: ReactNode
  className?: string
  /** Shows the drag handle. Defaults to true for bottom sheets. */
  handle?: boolean
  /**
   * Escape, before vaul acts on it.
   *
   * Forwarded to the underlying Radix dialog, which delivers the key to the TOPMOST
   * dismissable layer only — a drawer is always that layer, so nothing outside it can see
   * Escape while it is open. `preventDefault()` stops vaul dismissing and hands the key to
   * this handler instead, which is the only way anything containing the drawer can ever
   * receive it (issue #161).
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}

/** The portaled, positioned drawer panel. Compose Header/Body/Footer inside. */
export function DrawerContent({
  'aria-label': ariaLabel,
  children,
  className,
  handle,
  onEscapeKeyDown,
}: DrawerContentProps) {
  const { slots, direction, mode, wide, container } = useDrawerSlots()
  // State, not a ref: the portal mounts the panel a pass after this component does.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)

  useSheetDragClaim(direction === 'bottom' ? panel : null)

  // The floating panel is as tall as its view, so its height changes as the content does.
  // CSS cannot ease that: the height stays `auto` while only the content changes, so no
  // transition fires. Hence the Web Animations API, which neither `MotionConfig` nor
  // `vaul.css`'s reduced-motion block reaches — this reads the preference itself.
  const reduce = usePrefersReducedMotion()
  const eases = direction === 'left' && mode === 'anchored' && !wide && !reduce

  // A layout effect, so turning it off (the full-width calendar) disconnects the observer
  // before it can report that resize, which must not ease.
  useLayoutEffect(() => {
    if (!panel || !eases || typeof ResizeObserver === 'undefined') return

    // Seeded by the observer's first delivery, which every observed element gets.
    let last: number | undefined
    let ease: Animation | undefined
    const observer = new ResizeObserver(() => {
      // A resize mid-ease is skipped. The return to `auto` re-fires the observer, which
      // eases the rest from where this one stopped.
      if (ease?.playState === 'running') return

      const next = panel.offsetHeight

      if (last !== undefined && next !== last) {
        ease = panel.animate(
          { height: [`${last}px`, `${next}px`] },
          { duration: 200, easing: 'ease-out' },
        )
      }
      last = next
    })

    observer.observe(panel)

    return () => {
      observer.disconnect()
      ease?.cancel()
    }
  }, [panel, eases])

  const showHandle = handle ?? direction === 'bottom'
  // `undefined` means use the default themed root. An explicit `null` opts out.
  const target = container === undefined ? overlayContainer() : container

  return (
    <Vaul.Portal container={target ?? undefined}>
      <Vaul.Content
        ref={setPanel}
        aria-describedby={undefined}
        className={slots.content({ className })}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        {/* One Radix title, sr-only. The visible header, if any, is a separate
            child. So this never renders two <Dialog.Title>s. */}
        <Vaul.Title className="sr-only">{ariaLabel}</Vaul.Title>
        {showHandle && <Vaul.Handle className={slots.handle()} />}
        {children}
      </Vaul.Content>
    </Vaul.Portal>
  )
}

export function DrawerHeader({ children, className }: { children: ReactNode; className?: string }) {
  const { slots } = useDrawerSlots()

  return <div className={slots.header({ className })}>{children}</div>
}

/**
 * A fixed controls band between the header and the scrolling body, for
 * controls that act on the content below, not on the drawer itself. This sits
 * outside the scroll container on purpose. Placed inside, a toolbar would
 * scroll away exactly when a long list makes it useful.
 */
export function DrawerToolbar({
  children,
  className,
  field = false,
}: {
  children: ReactNode
  className?: string
  /**
   * The band holds a `SearchField` and nothing else, so it carries the header's inset and marks
   * itself as the band the suggestion list runs to.
   */
  field?: boolean
}) {
  const { slots } = useDrawerSlots()

  return (
    <div
      className={slots.toolbar({
        className: `${field ? `${RESULTS_BAND} px-gutter pb-2` : ''} ${className ?? ''}`,
      })}
    >
      {children}
    </div>
  )
}

export function DrawerBody({
  children,
  className,
  fitSheet = false,
}: {
  children: ReactNode
  className?: string
  /** Marks the body whose content a phone sheet opens tall enough to show (`use-fit-snap.ts`). */
  fitSheet?: boolean
}) {
  const { slots } = useDrawerSlots()
  // Once the body scrolls, its content slides under the opaque header, and
  // the two blend into one another. A soft inset shadow along the body's top
  // edge reads as "content continues up there". It shows only when something
  // IS above the fold, and it adds no permanent rule. Inset shadows paint
  // against the scroll container's own box, so this stays pinned to the seam
  // while the content moves. This is preferred over a hard border. It
  // appears progressively, and it works on both themes without a second
  // colour token.
  const [scrolled, setScrolled] = useState(false)

  return (
    <div
      className={slots.body({
        className: `${scrolled ? 'shadow-[inset_0_7px_6px_-7px_rgb(0_0_0/0.25)]' : ''} ${className ?? ''}`,
      })}
      data-sheet-fit={fitSheet || undefined}
      onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
    >
      {children}
    </div>
  )
}

export function DrawerFooter({
  children,
  className,
  sticky = false,
}: {
  children: ReactNode
  className?: string
  /**
   * Pins the footer to the VIEWPORT bottom edge of a snap-point bottom sheet.
   * The sheet is a full-height panel vaul translates down by the snap offset,
   * so the footer cancels that translate by offsetting the same distance from
   * the sheet's own bottom edge. DrawerStack mirrors it onto `--sy-sheet-top`
   * every frame. Content scrolls under the footer, and the body's slot clears
   * it.
   *
   * ⚠ `fixed`, not `absolute`, and the sheet's `pb-[calc(var(--sy-frame-h)*0.03)]`
   * is why. The cancellation only holds while the offset is measured from the
   * sheet's own box, and `absolute` resolves against the nearest POSITIONED
   * ancestor — the sheet's content box at best, 3% short. Measured at 390×844 on a deployed preview: the bar
   * sat at 818.69 rather than 844, with the body showing through the gap
   * (#320). `fixed` resolves against the nearest ancestor with a transform,
   * and that is the sheet itself, whatever DrawerStack nests in between.
   *
   * ⚠ That slot clears the CONTENT, and nothing more. Keeping FOCUS off the bar
   * takes the body's own `scroll-padding-bottom`, carrying `--sy-sheet-top` on
   * top of the published height: the body's bottom edge sits that far below the
   * viewport at any snap but the top one, and the bar paints at the viewport
   * (#326).
   *
   * Ignored inline, where there is no sheet to pin to: the footer ends the content in the
   * page's own flow.
   */
  sticky?: boolean
}) {
  const { slots, mode } = useDrawerSlots()
  const pinned = sticky && mode !== 'inline'
  const ref = useRef<HTMLDivElement>(null)

  // The body clears this footer by its own trailing length, and no caller can
  // hard-code it: across EventView's resolver states alone the bar measured
  // 65px to 197.5px at 390×844, and a translated label moves it again. A
  // constant was wrong in both directions — dead space under a short bar, the
  // end of the content still buried under a tall one. So the footer publishes
  // its own height, on its PARENT, which is the view's crossfade layer (#312)
  // rather than the sheet. Publishing on the sheet instead would scope one
  // value to both layers, and the outgoing layer's cleanup would then blank the
  // incoming footer's value mid-fade.
  //
  // ⚠ The contract that buys: a `sticky` footer's parent must also contain the
  // body it clears. Anywhere it does not, the clearance silently resolves to
  // its `0px` fallback and the content ends under the bar.
  //
  // `borderBoxSize` is the untransformed box, so the collapsed sheet's
  // `translate-y-full` cannot report a different one.
  useEffect(() => {
    const el = ref.current
    const layer = el?.parentElement

    if (!pinned || !el || !layer || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight

      layer.style.setProperty('--sy-footer-h', `${height}px`)
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
      layer.style.removeProperty('--sy-footer-h')
    }
  }, [pinned])

  return (
    <div
      ref={ref}
      className={slots.footer({
        className: `${pinned ? 'fixed inset-x-0 bottom-[var(--sy-sheet-top,0px)] z-10 bg-background' : ''} ${className ?? ''}`,
      })}
    >
      {children}
      {/* `viewport-fit=cover` (index.html) runs the layout viewport under the
          home indicator, so a bar flush with it puts its control in the gesture
          area. The spacer carries the inset rather than the footer's padding,
          which a caller's own `py-*` would merge away. */}
      {pinned && <div className="h-[env(safe-area-inset-bottom)]" />}
    </div>
  )
}

/** Wraps a control so activating it closes the drawer (vaul `Close`). */
export function DrawerClose({ children }: { children: ReactNode }) {
  return <Vaul.Close asChild>{children}</Vaul.Close>
}
