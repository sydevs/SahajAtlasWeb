import { type ReactNode, createContext, useContext, useState } from 'react'
import { Drawer as Vaul } from 'vaul'
import { tv, type VariantProps } from 'tailwind-variants'

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
// peek, third, and full ladder. Map-less, the drawer uses `mode="filled"`. It
// is then absolute and fills the widget container, instead of fixed to the
// viewport.

export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

const drawer = tv({
  slots: {
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none',
    // Every content band is capped at `--sy-content-max` (default 32rem) and
    // centred. So on a wide surface, such as a map-less embed or a large-mobile
    // bottom sheet, the views read as a centred column, instead of stretching
    // edge to edge. This has no effect on the roughly 22rem anchored panel,
    // which is already narrower.
    header:
      'mx-auto flex w-full max-w-[var(--sy-content-max,32rem)] shrink-0 items-center gap-2 px-4 pb-2 pt-4',
    // A second fixed band under the header, for controls that act on the
    // scrolling content below, such as SearchView's Filters and Sort. It
    // shares the header's width cap and `shrink-0`. It sits OUTSIDE the body,
    // so a long list scrolls under it instead of carrying it away. That is
    // exactly when those controls become useful.
    toolbar: 'mx-auto w-full max-w-[var(--sy-content-max,32rem)] shrink-0',
    // `overflow-x-hidden` is a backstop, not the fix. A drawer is a
    // fixed-width panel and must never scroll sideways. But it renders
    // host-authored prose, so one unbreakable string could always overflow
    // it. Content wraps at the source instead (see EventDetails'
    // `break-words`). This class only means the next such string degrades to
    // a clipped edge, instead of a horizontal scrollbar across the view. It
    // is safe for the full-bleed carousel, which is exactly the body's width,
    // and for popovers, which portal out of the body entirely.
    body: 'mx-auto min-h-0 w-full max-w-[var(--sy-content-max,32rem)] flex-1 overflow-y-auto overflow-x-hidden',
    footer:
      'mx-auto mt-auto w-full max-w-[var(--sy-content-max,32rem)] shrink-0 border-t border-gray-4',
    // This themes the vaul drag handle. Its vendored CSS hardcodes a light
    // grey. This gives the handle breathing room from the sheet's rounded top
    // edge, but keeps it close to the header below. It also adds a grab
    // cursor, so the drag affordance reads on pointer devices.
    handle: 'mb-1 mt-2.5 cursor-grab !bg-gray-7 active:cursor-grabbing',
  },
  variants: {
    direction: {
      // Flush to the edge on tablet (md–lg). At ≥lg it floats with a margin, so
      // the map shows around it, rounded to match the stacked ancestor panels.
      // The divider border matches those panels too. (`full` cancels the
      // float map-less.)
      //
      // TODO(rtl, #52 WS8): the remaining RTL gap is vaul's own `direction`
      // prop. That prop is physically left or right, and it drives both the
      // drag axis and the enter animation. These inset classes cannot fix
      // that alone. DrawerStack picks the direction, so the flip belongs
      // there and here together. This is deferred until an RTL locale
      // actually ships. Everything else here is already logical: the stack's
      // panel and cog positioning use `start-*`, and directional icons mirror
      // through BaseIcon's `flipRtl`.
      //
      // **The `22rem` in both variants below is paired with `DRAWER_W_REM` in
      // `hooks/use-map-controller.tsx`.** That constant becomes the map's
      // left camera padding, so the map knows how much of itself this panel
      // covers. Tailwind needs a literal here, and it cannot read the
      // constant. So changing this width means changing that one in the same
      // edit. Otherwise the map keeps framing around the old width, and
      // nothing anywhere reports the drift.
      left: {
        content:
          'inset-y-0 left-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100%-2rem)] rounded-none border border-divider lg:inset-y-4 lg:left-4 lg:rounded-2xl',
      },
      right: {
        content:
          'inset-y-0 right-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100%-2rem)] rounded-none border border-divider lg:inset-y-4 lg:right-4 lg:rounded-2xl',
      },
      // Snap-point sheets must use the full viewport height. Vaul computes
      // its snap translate from the window height, so a content-sized sheet
      // would get pushed off-screen. The 3dvh bottom padding keeps the
      // footer above the fold at the 0.97 top snap, since the last 3% stays
      // hidden. `full` cancels this map-less.
      bottom: {
        content:
          'inset-x-0 bottom-0 h-[var(--sy-frame-h)] rounded-t-2xl border-t border-divider pb-[calc(var(--sy-frame-h)*0.03)]',
      },
      top: {
        content: 'inset-x-0 top-0 h-[var(--sy-frame-h)] rounded-b-2xl border-b border-divider',
      },
    },
    // How the panel relates to its container. This used to be two
    // independent booleans, `contained` and `full`. But only two of the four
    // possible states ever occurred in practice. DrawerStack always set both
    // together, and `filled`'s class list is entirely `!important` overrides
    // that cancel the other one. That pattern is the signature of a variant
    // that wanted to be a mode.
    mode: {
      /** Fixed to the viewport, anchored to the `direction` edge. This is the map layout. */
      anchored: {},
      /**
       * Absolute within the widget container, filling it. This is the
       * map-less single panel. It is still a real vaul root, so the header
       * close button keeps working.
       */
      filled: {
        content: '!absolute !inset-0 !h-full !max-h-none !w-full !max-w-none !rounded-none !pb-0',
      },
    },
    // A full-width surface, such as CalendarView, instead of the roughly
    // 22rem left panel, so a month grid stays legible. This only matters with
    // the anchored `left` panel, in map mode at ≥md. The bottom sheet is
    // already full-width, and `filled` (map-less) already fills the
    // container. So both ignore this variant (see the compound below).
    wide: { true: {}, false: {} },
  },
  compoundVariants: [
    // The bottom sheet shows a drag handle that already spaces the header
    // from the sheet's top edge. So this relaxes the header's top padding,
    // for a balanced handle-to-header gap. This does not apply when `filled`
    // hides the handle, map-less, where the header owns the top instead.
    { direction: 'bottom', mode: 'anchored', class: { header: 'pt-2' } },
    // Wide, plus the anchored left panel: this fills the container, flush at
    // md and floating at lg, instead of the narrow left panel. `!important`
    // overrides the left variant's fixed width and edge insets. This mirrors
    // how `filled` overrides them map-less.
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

type DrawerCtx = {
  slots: DrawerSlots
  direction: DrawerDirection
  // A `filled` drawer, map-less, hides the drag handle. There is nothing to drag.
  mode: 'anchored' | 'filled'
  // The portal target for a real drawer. Map-less mode passes the widget container.
  container?: HTMLElement | null
}

const DrawerContext = createContext<DrawerCtx>({
  slots: drawer({ direction: 'bottom' }),
  direction: 'bottom',
  mode: 'anchored',
})

const useDrawerSlots = () => useContext(DrawerContext)

export type DrawerProps = VariantProps<typeof drawer> & {
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Non-modal by default. The map and content behind it stay interactive. */
  modal?: boolean
  /** When false, the drawer cannot be closed by swipe, Esc, or clicking outside (map-less root). */
  dismissible?: boolean
  /** Restricts dragging to the handle. When no handle renders (the left panel),
   *  this makes the drawer undraggable, but the close button still dismisses it. */
  handleOnly?: boolean
  /** Mobile snap points, e.g. `['96px', '336px', 0.97]`. */
  snapPoints?: (number | string)[]
  activeSnapPoint?: number | string | null
  setActiveSnapPoint?: (snapPoint: number | string | null) => void
  /** The portal target. Map-less passes the widget container. The default is the theme root. */
  container?: HTMLElement | null
  /**
   * The box vaul measures snap points against. **This is not the same
   * question as `container`.** Conflating the two inverts the sheet. See the
   * note on `rootProps` below. Omit this prop to measure the window instead.
   * That is right for every mount except inside the expanded dialog.
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
  mode = 'anchored',
  wide = false,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  container,
  measureAgainst,
  children,
}: DrawerProps) {
  const slots = drawer({ direction, mode, wide })

  // This passes the snap props unconditionally. `undefined` means no snap
  // points. This lets the WithFadeFrom/WithoutFadeFrom discriminated union
  // resolve cleanly.
  const rootProps = {
    // ⚠ Vaul measures the CONTAINER when given one, and `window.innerHeight`
    // otherwise (`snapPointsOffset`, vaul dist). Passing one is what makes a
    // fractional snap point correct inside `CompactEmbedView`'s dialog. That
    // dialog keeps a margin, so it is 16-32px shorter than the window.
    // Without this prop, the near-full snap sat that far out, and the sheet
    // overran the clip edge.
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
    // `frameElement()`: the compact card's expanded dialog, or a contained
    // map's `MapFrame` (#169). It supplies `undefined` wherever there is no
    // frame, and that is where vaul's own `window.innerHeight` is correct.
    container: measureAgainst ?? undefined,
    direction,
    dismissible,
    handleOnly,
    modal,
    open,
    onOpenChange,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    children,
  }

  return (
    <DrawerContext.Provider value={{ slots, direction: direction ?? 'bottom', mode, container }}>
      <Vaul.Root {...rootProps} />
    </DrawerContext.Provider>
  )
}

/**
 * Establishes the drawer slot context (the header/body/footer padding for a given
 * mode plus direction) WITHOUT a vaul root, so a view's `Drawer*` subtree can be
 * previewed outside a real drawer (the story harness) with the SAME chrome the app
 * renders. The app itself always goes through `<Drawer>`/`<DrawerContent>`. This is
 * only for rendering the inner content standalone. It defaults to the map-less
 * `filled` bottom drawer, which is what the harness simulates.
 */
export function DrawerSlotsProvider({
  mode = 'filled',
  direction = 'bottom',
  children,
}: {
  mode?: 'anchored' | 'filled'
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
  /** Shows the drag handle. Defaults to true for bottom sheets (never when filled). */
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
  const { slots, direction, mode, container } = useDrawerSlots()

  const showHandle = handle ?? (direction === 'bottom' && mode !== 'filled')
  // `undefined` means use the default themed root. An explicit `null` opts out.
  const target = container === undefined ? overlayContainer() : container

  return (
    <Vaul.Portal container={target ?? undefined}>
      <Vaul.Content
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
}: {
  children: ReactNode
  className?: string
}) {
  const { slots } = useDrawerSlots()

  return <div className={slots.toolbar({ className })}>{children}</div>
}

export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
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
   * The sheet is a full-height translated panel, so `fixed` would resolve
   * against it instead. So the footer offsets by the sheet's live top. That
   * value is mirrored every frame onto `--sy-sheet-top` by DrawerStack.
   * Content scrolls under the footer. Give the body matching bottom padding.
   */
  sticky?: boolean
}) {
  const { slots } = useDrawerSlots()

  return (
    <div
      className={slots.footer({
        className: `${sticky ? 'absolute inset-x-0 bottom-[var(--sy-sheet-top,0px)] z-10 bg-background' : ''} ${className ?? ''}`,
      })}
    >
      {children}
    </div>
  )
}

/** Wraps a control so activating it closes the drawer (vaul `Close`). */
export function DrawerClose({ children }: { children: ReactNode }) {
  return <Vaul.Close asChild>{children}</Vaul.Close>
}
