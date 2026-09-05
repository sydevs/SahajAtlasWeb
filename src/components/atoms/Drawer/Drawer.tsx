import { type ReactNode, createContext, useContext, useState } from 'react'
import { Drawer as Vaul } from 'vaul'
import { tv, type VariantProps } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'

// A drawer built on vaul (see issue #30). A tailwind-variants slot set portaled
// into the themed widget root via `overlayContainer()`. Non-modal by default, so
// the map/content behind stays interactive. The pinned `vaul@1.1.2` patch
// (patches/) forwards `modal` to Radix, so non-modal is *truly* non-modal (no
// background aria-hidden or focus trap).
//
// DrawerStack renders a SINGLE drawer holding the active (top) view. Parent views
// are simulated as static peek cards behind it, not real nested drawers. Direction
// is left at ≥md, bottom on mobile. `snapPoints` are the mobile peek/third/full
// ladder. Map-less, the drawer is `mode="filled"` — absolute and filling the
// widget container, rather than fixed to the viewport.

export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

const drawer = tv({
  slots: {
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none',
    // Every content band is capped at `--sy-content-max` (default 32rem) and
    // centred, so on a wide surface — a map-less embed, a large-mobile bottom
    // sheet — the views read as a centred column, rather than stretching edge
    // to edge. This is a no-op on the roughly 22rem anchored panel, which is
    // already narrower.
    header:
      'mx-auto flex w-full max-w-[var(--sy-content-max,32rem)] shrink-0 items-center gap-2 px-4 pb-2 pt-4',
    // A second fixed band under the header, for controls that act on the
    // scrolling content below (SearchView's Filters and Sort). Same width cap
    // and `shrink-0` as the header: it sits OUTSIDE the body, so a long list
    // scrolls under it instead of carrying it away — which is exactly when
    // those controls become useful.
    toolbar: 'mx-auto w-full max-w-[var(--sy-content-max,32rem)] shrink-0',
    // `overflow-x-hidden` is a backstop, not the fix: a drawer is a
    // fixed-width panel and must never scroll sideways, but it renders
    // host-authored prose, so one unbreakable string could always overflow
    // it. Content wraps at the source (see EventDetails' `break-words`). This
    // class just means the next such string degrades to a clipped edge,
    // instead of a horizontal scrollbar across the view. It is safe for the
    // full-bleed carousel, which is exactly the body's width, and for
    // popovers, which portal out of the body entirely.
    body: 'mx-auto min-h-0 w-full max-w-[var(--sy-content-max,32rem)] flex-1 overflow-y-auto overflow-x-hidden',
    footer:
      'mx-auto mt-auto w-full max-w-[var(--sy-content-max,32rem)] shrink-0 border-t border-gray-4',
    // Themes the vaul drag handle (its vendored CSS hardcodes a light grey),
    // gives it breathing room from the sheet's rounded top edge but sits it
    // close to the header below, and adds a grab cursor so the drag
    // affordance reads on pointer devices.
    handle: 'mb-1 mt-2.5 cursor-grab !bg-gray-7 active:cursor-grabbing',
  },
  variants: {
    direction: {
      // Flush to the edge on tablet (md-lg). At ≥lg it floats with a margin so the
      // map shows around it, rounded to match the stacked ancestor panels. The
      // divider border matches those panels too (`full` cancels the float map-less).
      // TODO(rtl, #52 WS8): the remaining RTL gap is vaul's own `direction`
      // prop, which is physically left/right and drives both the drag axis
      // and the enter animation. These inset classes cannot fix that alone.
      // DrawerStack picks the direction, so the flip belongs there and here
      // together, deferred until an RTL locale actually ships. Everything
      // else is already logical: the stack's panel/cog positioning uses
      // `start-*`, and directional icons mirror via BaseIcon's `flipRtl`.
      // **The `22rem` in both variants below is paired with `DRAWER_W_REM` in
      // `hooks/use-map-controller.tsx`** — that constant becomes the map's left camera
      // padding, so the map knows how much of itself this panel covers. Tailwind needs a
      // literal here and can't read the constant, so changing this width means changing
      // that one in the same edit. Otherwise the map keeps framing around the old width
      // and nothing anywhere fails to tell you.
      left: {
        content:
          'inset-y-0 left-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100%-2rem)] rounded-none border border-divider lg:inset-y-4 lg:left-4 lg:rounded-2xl',
      },
      right: {
        content:
          'inset-y-0 right-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100%-2rem)] rounded-none border border-divider lg:inset-y-4 lg:right-4 lg:rounded-2xl',
      },
      // Snap-point sheets must be full viewport height: vaul computes its
      // snap translate from the window height, so a content-sized sheet gets
      // pushed off-screen. The 3dvh bottom padding keeps the footer above
      // the fold at the 0.97 top snap (the last 3% is hidden). `full`
      // cancels it for map-less.
      bottom: {
        content:
          'inset-x-0 bottom-0 h-[var(--sy-frame-h)] rounded-t-2xl border-t border-divider pb-[calc(var(--sy-frame-h)*0.03)]',
      },
      top: {
        content: 'inset-x-0 top-0 h-[var(--sy-frame-h)] rounded-b-2xl border-b border-divider',
      },
    },
    // How the panel relates to its container. These used to be two
    // independent booleans (`contained` + `full`), but only two of the four
    // states were ever representable in practice — DrawerStack always set
    // both together, and `filled`'s class list is entirely `!important`
    // overrides cancelling the other one, which is the signature of a
    // variant that wanted to be a mode.
    mode: {
      /** Fixed to the viewport, anchored to the `direction` edge (the map layout). */
      anchored: {},
      /**
       * Absolute within the widget container and filling it — the map-less single
       * panel. Still a real vaul root, so the header close button keeps working.
       */
      filled: {
        content: '!absolute !inset-0 !h-full !max-h-none !w-full !max-w-none !rounded-none !pb-0',
      },
    },
    // A full-width surface (CalendarView), instead of the roughly 22rem left
    // panel, so a month grid stays legible. Only meaningful with the
    // anchored `left` panel (map mode ≥md). The bottom sheet is already
    // full-width, and `filled` (map-less) already fills the container, so
    // both ignore it (see the compound below).
    wide: { true: {}, false: {} },
  },
  compoundVariants: [
    // The bottom sheet shows a drag handle that already spaces the header
    // from the sheet's top edge, so this relaxes the header's top padding
    // for a balanced handle-to-header gap. Not when `filled` hides the
    // handle (map-less), where the header owns the top.
    { direction: 'bottom', mode: 'anchored', class: { header: 'pt-2' } },
    // Wide plus the anchored left panel: fills the container (flush at md,
    // floating at lg), rather than the narrow left panel. `!important`
    // overrides the left variant's fixed width and edge insets, mirroring
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
  // A `filled` drawer (map-less) hides the drag handle — nothing to drag.
  mode: 'anchored' | 'filled'
  // The portal target for a real drawer (map-less passes the widget container).
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
  /** Non-modal by default — the map/content behind stays interactive. */
  modal?: boolean
  /** When false, the drawer cannot be closed by swipe, Esc, or clicking outside (map-less root). */
  dismissible?: boolean
  /** Restricts dragging to the handle. With no handle rendered (the left panel), this
   *  makes the drawer undraggable while the close button still dismisses it. */
  handleOnly?: boolean
  /** Mobile snap points, e.g. `['96px', '336px', 0.97]`. */
  snapPoints?: (number | string)[]
  activeSnapPoint?: number | string | null
  setActiveSnapPoint?: (snapPoint: number | string | null) => void
  /** The portal target. Map-less passes the widget container. The default is the theme root. */
  container?: HTMLElement | null
  /**
   * The box vaul measures snap points against. **This is not the same question as
   * `container`**, and conflating them inverts the sheet — see the note on `rootProps` below.
   * Omit it to measure the window, which is right for every mount except inside the expanded
   * dialog.
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

  // Passes the snap props unconditionally (undefined means no snap points),
  // so the WithFadeFrom/WithoutFadeFrom discriminated union resolves cleanly.
  const rootProps = {
    // ⚠ vaul measures the CONTAINER when given one, and `window.innerHeight` otherwise
    // (`snapPointsOffset`, vaul dist). Passing one is what makes a fractional snap point correct
    // inside `CompactEmbedView`'s dialog, which keeps a margin and so is 16-32px shorter than the
    // window — without it, the near-full snap sat that far out and the sheet overran the clip edge.
    //
    // ⚠ **But it must be a box, and the portal target is not always one.** This briefly passed
    // `container` — the element we portal into — on the reasoning that measuring the box we render
    // in cannot be wrong. Embedded, that element is the theme root, which is `display: contents`
    // (`Widget.tsx`) and therefore measures **0×0**. Standalone it is `<html>`, which in map mode
    // holds nothing but `position: fixed` children and measured **195px against an 844px
    // viewport**. Every snap offset is `containerSize.height - height`, so at zero the ladder
    // `['80px','300px',0.97]` becomes `[-80,-300,0]` instead of `[764,544,25]` — the sheet
    // translates UP off the bottom and covers the top of the screen. That is the default phone
    // experience of a map embed, and lint, typecheck and all 1263 unit specs stay green through it.
    //
    // So the measurement box is its own prop. `DrawerStack` supplies `frameElement()` — the
    // compact card's expanded dialog, or a contained map's `MapFrame` (#169) — and `undefined`
    // wherever there is no frame, which is where vaul's own `window.innerHeight` is correct.
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
        {/* One Radix title, sr-only — the visible header (if any) is a separate
            child, so this never renders two <Dialog.Title>s. */}
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
 * A fixed controls band between the header and the scrolling body, for controls
 * that act on the content below, rather than on the drawer itself. This sits
 * outside the scroll container on purpose: put inside, a toolbar scrolls away
 * exactly when a long list makes it useful.
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
  // Once the body scrolls, its content slides under the (opaque) header, and
  // the two blend into one another. A soft inset shadow along the body's top
  // edge — shown only when there IS something above the fold — reads as
  // "content continues up there" without adding a permanent rule. Inset
  // shadows paint against the scroll container's own box, so this stays
  // pinned to the seam while the content moves. This is preferred over a
  // hard border: it appears progressively, and it works on both themes
  // without a second colour token.
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
   * against it — instead, the footer offsets by the sheet's live top,
   * mirrored every frame onto `--sy-sheet-top` by DrawerStack. Content
   * scrolls under it. Give the body matching bottom padding.
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
