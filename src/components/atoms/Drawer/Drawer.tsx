import { type ReactNode, createContext, useContext, useState } from 'react'
import { Drawer as Vaul } from 'vaul'
import { tv, type VariantProps } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'

// A drawer built on vaul (see issue #30). A tailwind-variants slot set portaled
// into the themed widget root via `overlayContainer()`. Non-modal by default so
// the map/content behind stays interactive; the pinned `vaul@1.1.2` patch
// (patches/) forwards `modal` to Radix so non-modal is *truly* non-modal (no
// background aria-hidden / focus trap).
//
// DrawerStack renders a SINGLE drawer holding the active (top) view; parent views
// are simulated as static peek cards behind it, not real nested drawers. Direction
// is left at ≥md, bottom on mobile; `snapPoints` are the mobile peek/third/full
// ladder. Map-less, the drawer is `mode="filled"` — absolute and filling the
// widget container rather than fixed to the viewport.

export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

const drawer = tv({
  slots: {
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none',
    // Every content band is capped at `--sy-content-max` (default 32rem) and
    // centred, so on a wide surface — a map-less embed, a large-mobile bottom
    // sheet — the views read as a centred column rather than stretching edge to
    // edge. A no-op on the ~22rem anchored panel, which is already narrower.
    header:
      'mx-auto flex w-full max-w-[var(--sy-content-max,32rem)] shrink-0 items-center gap-2 px-4 pb-2 pt-4',
    body: 'mx-auto min-h-0 w-full max-w-[var(--sy-content-max,32rem)] flex-1 overflow-y-auto',
    footer:
      'mx-auto mt-auto w-full max-w-[var(--sy-content-max,32rem)] shrink-0 border-t border-gray-4',
    // Theme the vaul drag handle (its vendored CSS hardcodes a light grey), give it
    // breathing room from the sheet's rounded top edge but sit it close to the header
    // below, and a grab cursor so the drag affordance reads on pointer devices.
    handle: 'mb-1 mt-2.5 cursor-grab !bg-gray-7 active:cursor-grabbing',
  },
  variants: {
    direction: {
      // Flush to the edge on tablet (md–lg); at ≥lg it floats with a margin so the
      // map shows around it, rounded to match the stacked ancestor panels. The
      // divider border matches those panels too (`full` cancels the float map-less).
      // TODO(rtl, #52 WS8): the remaining RTL gap is vaul's own `direction`
      // prop, which is physically left/right and drives the drag axis + enter
      // animation; these inset classes can't fix that alone. DrawerStack picks
      // the direction, so the flip belongs there + here together, deferred until
      // an RTL locale actually ships. Everything else is already logical: the
      // stack's panel/cog positioning uses `start-*`, and directional icons
      // mirror via BaseIcon's `flipRtl`.
      left: {
        content:
          'inset-y-0 left-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100vw-2rem)] rounded-none border border-divider lg:inset-y-4 lg:left-4 lg:rounded-2xl',
      },
      right: {
        content:
          'inset-y-0 right-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100vw-2rem)] rounded-none border border-divider lg:inset-y-4 lg:right-4 lg:rounded-2xl',
      },
      // Snap-point sheets must be full viewport height: vaul computes its snap
      // translate from the window height, so a content-sized sheet gets pushed
      // off-screen. The 3dvh bottom padding keeps the footer above the fold at the
      // 0.97 top snap (the last 3% is hidden); `full` cancels it for map-less.
      bottom: {
        content: 'inset-x-0 bottom-0 h-dvh rounded-t-2xl border-t border-divider pb-[3dvh]',
      },
      top: { content: 'inset-x-0 top-0 h-dvh rounded-b-2xl border-b border-divider' },
    },
    // How the panel relates to its container. These were two independent booleans
    // (`contained` + `full`), but only two of the four states were ever
    // representable in practice — DrawerStack always set both together, and
    // `filled`'s class list is entirely `!important` overrides cancelling the
    // other one, which is the signature of a variant that wanted to be a mode.
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
  },
  compoundVariants: [
    // The bottom sheet shows a drag handle that already spaces the header from the
    // sheet's top edge, so relax the header's top padding for a balanced handle→header
    // gap. Not when `filled` hides the handle (map-less), where the header owns the top.
    { direction: 'bottom', mode: 'anchored', class: { header: 'pt-2' } },
  ],
  defaultVariants: { direction: 'bottom', mode: 'anchored' },
})

type DrawerSlots = ReturnType<typeof drawer>

type DrawerCtx = {
  slots: DrawerSlots
  direction: DrawerDirection
  // A `filled` drawer (map-less) hides the drag handle — nothing to drag.
  mode: 'anchored' | 'filled'
  // Portal target for a real drawer (map-less passes the widget container).
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
  /** When false the drawer can't be closed by swipe/Esc/outside (map-less root). */
  dismissible?: boolean
  /** Restrict dragging to the handle. With no handle rendered (the left panel), this
   *  makes the drawer undraggable while the close button still dismisses it. */
  handleOnly?: boolean
  /** Mobile snap points, e.g. `['96px', '336px', 0.97]`. */
  snapPoints?: (number | string)[]
  activeSnapPoint?: number | string | null
  setActiveSnapPoint?: (snapPoint: number | string | null) => void
  /** Portal target (map-less passes the widget container; default is the theme root). */
  container?: HTMLElement | null
  children: ReactNode
}

/** The drawer root. Provides direction/slots to the DrawerContent subtree. */
export function Drawer({
  open,
  onOpenChange,
  direction = 'bottom',
  modal = false,
  dismissible = true,
  handleOnly = false,
  mode = 'anchored',
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  container,
  children,
}: DrawerProps) {
  const slots = drawer({ direction, mode })

  // Pass snap props unconditionally (undefined = no snap points) so the
  // WithFadeFrom/WithoutFadeFrom discriminated union resolves cleanly.
  const rootProps = {
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
 * mode + direction) WITHOUT a vaul root — so a view's `Drawer*` subtree can be
 * previewed outside a real drawer (the story harness) with the SAME chrome the app
 * renders. The app itself always goes through `<Drawer>`/`<DrawerContent>`; this is
 * only for rendering the inner content standalone. Defaults to the map-less
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
  /** Accessible name for the dialog (Radix requires one; rendered sr-only). */
  'aria-label': string
  children: ReactNode
  className?: string
  /** Show the drag handle. Defaults to true for bottom sheets (never when filled). */
  handle?: boolean
}

/** The portaled, positioned drawer panel. Compose Header/Body/Footer inside. */
export function DrawerContent({
  'aria-label': ariaLabel,
  children,
  className,
  handle,
}: DrawerContentProps) {
  const { slots, direction, mode, container } = useDrawerSlots()

  const showHandle = handle ?? (direction === 'bottom' && mode !== 'filled')
  // `undefined` = use the default themed root; an explicit `null` opts out.
  const target = container === undefined ? overlayContainer() : container

  return (
    <Vaul.Portal container={target ?? undefined}>
      <Vaul.Content aria-describedby={undefined} className={slots.content({ className })}>
        {/* Single Radix title, sr-only — the visible header (if any) is a separate
            child, so we never render two <Dialog.Title>s. */}
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

export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  const { slots } = useDrawerSlots()
  // Once the body scrolls, its content slides under the (opaque) header and the
  // two blend into one another. A soft inset shadow along the body's top edge —
  // shown only when there IS something above the fold — reads as "content
  // continues up there" without adding a permanent rule. Inset shadows are
  // painted against the scroll container's own box, so it stays pinned to the
  // seam while the content moves. Preferred over a hard border: it appears
  // progressively, and it works on both themes without a second colour token.
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
   * Pin the footer to the VIEWPORT bottom edge of a snap-point bottom sheet.
   * The sheet is a full-height translated panel, so `fixed` would resolve
   * against it — instead the footer offsets by the sheet's live top,
   * mirrored every frame onto `--sy-sheet-top` by DrawerStack. Content
   * scrolls under it; give the body matching bottom padding.
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
