import { type ReactNode, createContext, useContext } from 'react'
import { Drawer as Vaul } from 'vaul'
import { tv, type VariantProps } from 'tailwind-variants'

import { overlayContainer } from '@/lib/overlay'

// A drawer built on vaul (see AC-0 in issue #30). Mirrors the Modal atom: a
// tailwind-variants slot set portaled into the themed widget root via
// `overlayContainer()`. Non-modal by default so the map/content behind stays
// interactive; the pinned `vaul@1.1.2` patch (patches/) forwards `modal` to Radix
// so non-modal is *truly* non-modal (no background aria-hidden / focus trap).
//
// The DrawerStack renders one <Drawer> per resolved URL ancestor: the base as a
// root drawer, deeper entries as `nested`. Direction is left at ≥md, bottom on
// mobile; snapPoints are the mobile RootView peek/half/full. In map-less mode the
// base view renders *inline* (a DrawerContent with no enclosing <Drawer>) and the
// deeper drawers are `contained` — absolute within the widget container, not fixed
// to the viewport.

export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

const drawer = tv({
  slots: {
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none',
    // The map-less base view: plain content filling the widget container.
    inline: 'flex h-full w-full flex-col overflow-y-auto bg-background text-foreground',
    header: 'flex shrink-0 items-center gap-2 px-4 pb-2 pt-4',
    body: 'min-h-0 flex-1 overflow-y-auto px-4 py-2',
    footer: 'mt-auto shrink-0 border-t border-gray-4',
    // Theme the vaul drag handle (its vendored CSS hardcodes a light grey).
    handle: '!bg-gray-7',
  },
  variants: {
    direction: {
      left: { content: 'inset-y-0 left-0 h-full w-[var(--sy-drawer-w,22rem)] max-w-[90vw]' },
      right: { content: 'inset-y-0 right-0 h-full w-[var(--sy-drawer-w,22rem)] max-w-[90vw]' },
      bottom: { content: 'inset-x-0 bottom-0 max-h-[97%] rounded-t-2xl' },
      top: { content: 'inset-x-0 top-0 max-h-[97%] rounded-b-2xl' },
    },
    // Map-less: position absolutely within the widget container instead of fixed to
    // the viewport, so the drawer covers only the content area.
    contained: {
      true: { content: '!absolute' },
      false: {},
    },
  },
  defaultVariants: { direction: 'bottom', contained: false },
})

type DrawerSlots = ReturnType<typeof drawer>

type DrawerCtx = {
  slots: DrawerSlots
  direction: DrawerDirection
  // No enclosing <Drawer> → DrawerContent renders inline (the map-less base view).
  inline: boolean
  // Portal target for a real drawer (map-less passes the widget container).
  container?: HTMLElement | null
}

const DrawerContext = createContext<DrawerCtx>({
  slots: drawer({ direction: 'bottom' }),
  direction: 'bottom',
  inline: true,
})

const useDrawerSlots = () => useContext(DrawerContext)

export type DrawerProps = VariantProps<typeof drawer> & {
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Non-modal by default — the map/content behind stays interactive. */
  modal?: boolean
  /** When false the drawer can't be closed by swipe/Esc/outside (the RootView). */
  dismissible?: boolean
  /** Render as a stacked child of a parent Drawer (vaul `NestedRoot`). */
  nested?: boolean
  /** Mobile snap points, e.g. `['8rem', 0.5, 0.97]`. Only the RootView uses them. */
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
  nested = false,
  contained = false,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  container,
  children,
}: DrawerProps) {
  const slots = drawer({ direction, contained })

  // Pass snap props unconditionally (undefined = no snap points) so the
  // WithFadeFrom/WithoutFadeFrom discriminated union resolves cleanly, and render
  // the root/nested variant explicitly rather than through a union-typed element.
  const rootProps = {
    direction,
    dismissible,
    modal,
    open,
    onOpenChange,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    children,
  }

  return (
    <DrawerContext.Provider
      value={{ slots, direction: direction ?? 'bottom', inline: false, container }}
    >
      {nested ? <Vaul.NestedRoot {...rootProps} /> : <Vaul.Root {...rootProps} />}
    </DrawerContext.Provider>
  )
}

export type DrawerContentProps = {
  /** Accessible name for the dialog (Radix requires one; rendered sr-only). */
  ariaLabel: string
  children: ReactNode
  className?: string
  /** Show the drag handle. Defaults to true for bottom sheets only. */
  handle?: boolean
}

/** The portaled, positioned drawer panel — or, with no enclosing <Drawer>, plain
 *  inline content (the map-less base view). Compose Header/Body/Footer inside. */
export function DrawerContent({ ariaLabel, children, className, handle }: DrawerContentProps) {
  const { slots, direction, inline, container } = useDrawerSlots()

  if (inline) {
    return <div className={slots.inline({ className })}>{children}</div>
  }

  const showHandle = handle ?? direction === 'bottom'
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

  return <div className={slots.body({ className })}>{children}</div>
}

export function DrawerFooter({ children, className }: { children: ReactNode; className?: string }) {
  const { slots } = useDrawerSlots()

  return <div className={slots.footer({ className })}>{children}</div>
}

/** Wraps a control so activating it closes the drawer (vaul `Close`). */
export function DrawerClose({ children }: { children: ReactNode }) {
  return <Vaul.Close asChild>{children}</Vaul.Close>
}
