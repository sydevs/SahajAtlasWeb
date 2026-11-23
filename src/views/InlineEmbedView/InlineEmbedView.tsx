import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import { m } from 'framer-motion'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { MapProvider } from 'react-map-gl/mapbox'
import { Expand } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { SettingsMenu } from '@/components/molecules'
import { regionsQuery } from '@/config/api'
import embed from '@/config/embed'
import { useWidgetMode } from '@/config/mode'
import { useReportModal } from '@/config/store'
import { LocalExpansionProvider, useExpansion } from '@/hooks/use-expansion'
import { useLocale } from '@/hooks/use-locale'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { RealMapControllerProvider } from '@/hooks/use-map-controller-real'
import { useOpenerRestore } from '@/hooks/use-opener-restore'
import { usePublishedNode } from '@/hooks/use-published-node'
import { fallbackUrl } from '@/lib/fallback-url'
import { setFrame, widgetOverlayContainer } from '@/lib/overlay'
import { DrawerStack } from '@/views/DrawerStack/DrawerStack'
import { MapInterface, MapLayer, useInterfaceBoot } from '@/views/FullInterface'
import { headingPlace } from '@/views/InlineEmbedView/heading-place'
import {
  headerOffset,
  hostElement,
  pageHasHeading,
  useGrowHost,
} from '@/views/InlineEmbedView/host-page'

/**
 * What every embed is on load: the atlas in the host's own page. A heading names the place,
 * the top view's content runs down the left in the page's flow, and a square map stays in view
 * beside it. "Expand map" opens the map-first interface in a modal over the page, below the
 * host's header; "Close map" brings the visitor back to where they were.
 *
 * **This is a view, not a component, because it is a whole screen** — the alternative to the
 * map-first `FullInterface`, chosen once at mount by the entry.
 *
 * **The dialog lives here, rather than in `atoms/`.** It publishes itself as the app's portal
 * target, needs `contain: layout` because this app's interface is fixed-positioned throughout,
 * and has exactly one caller. `Modal` is the generic dialog atom.
 */

// ===== THE HEADING ===== //

/**
 * "Free Meditation classes in London": the place the route is in (`headingPlace`), or the
 * world's own title. A venue or a class keeps its own name as the panel's smaller heading below.
 */
function PlaceHeading({ level }: { level: 'h1' | 'h2' }) {
  const { t, regionNames } = useLocale()
  const { pathname } = useLocation()
  const { data: tree } = useQuery(regionsQuery())

  const place = useMemo(
    () => headingPlace(pathname, tree, (code) => regionNames.of(code)),
    [pathname, tree, regionNames],
  )

  const Heading = level

  return (
    <Heading className="min-w-0 text-2xl font-semibold">
      {place ? t('countries.place_title', { place }) : t('countries.title')}
    </Heading>
  )
}

// ===== THE DIALOG IT OPENS ===== //

// ⚠ **The dialog stacks in the HOST's stacking context**, so it must outrank its chrome. It
// starts below the host's header rather than over it, which is what keeps that header in view.
// Below the int32 maximum, so a host layer can still win.
const aboveHost = 'z-[2147483000]'
// `contain: layout` makes the dialog the containing block for the interface's fixed layer.
// ⚠ Clip, never hidden — `components/AGENTS.md` carries why (#326).
const contentClass = `fixed inset-x-0 bottom-0 ${aboveHost} overflow-clip bg-background text-foreground outline-none [contain:layout]`

/**
 * The map-first interface, over the host's page below its header.
 *
 * ⚠ **`contain: layout` is load-bearing, not an optimisation.** Everything rendered inside —
 * the map canvas, every drawer, the peek strips, the cog — is `position: fixed`, and without it
 * they would resolve against the viewport and paint over the host's header.
 *
 * ⚠ That is the exact property `src/components/AGENTS.md` forbids on the SCOPE ROOT, for the
 * same mechanism pointed the other way. Do not move it up the tree.
 *
 * **Radix owns the behaviour**: the focus trap, `aria-modal`, Escape, the host page's scroll
 * lock — via `Primitive.Overlay`, where `react-remove-scroll` lives — and dismissal by pointer
 * outside, which includes the host's header.
 *
 * **Escape reaches the topmost layer, which may not be this one.** A vaul drawer inside is a
 * Radix dialog too, so it takes the key first. `DrawerStack`'s `onEscapeKeyDown` finishes the
 * ladder once the stack has nowhere left to go, and its "Close map" button is the visible exit.
 *
 * **Every portal in the app redirects inside it while it is open** (`setFrame`), because a
 * modal traps focus in its own content and hides everything else from assistive technology.
 */
function ExpandedDialog({
  open,
  top,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  top: number
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  // Published as the widget's frame, and the children wait for it — `usePublishedNode`
  // carries the timing argument.
  //
  // The extra `contentRef` is this component's own: `onOpenAutoFocus` below reads the node
  // synchronously from a callback that must not re-subscribe when it changes. The same node
  // goes to `useOpenerRestore`, which needs it to tell this dialog's panel from the control
  // that opened it.
  const { node, adopt: adoptFrame } = usePublishedNode<HTMLDivElement>(setFrame)
  const { adoptContent, restoreFocus } = useOpenerRestore<HTMLDivElement>(open)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const adopt = useCallback(
    (element: HTMLDivElement | null) => {
      contentRef.current = element
      adoptContent(element)
      adoptFrame(element)
    },
    [adoptContent, adoptFrame],
  )

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      {/* NOT `overlayContainer()`: that resolves to this dialog once it is open, and a portal
          cannot render into its own subtree. */}
      <Primitive.Portal container={widgetOverlayContainer()}>
        <Primitive.Overlay className={`fixed inset-x-0 bottom-0 ${aboveHost}`} style={{ top }} />
        {/* Radix warns unless the missing description is opted out of by name. */}
        <Primitive.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={restoreFocus}
          // Focuses the container, not the first control inside it. Radix's default sends
          // focus to the first tabbable, announced with no word about what just opened.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
        >
          {/* Entry only. Animating the way out needs `forceMount`, which would keep the
              second map mounted while closed. Framer, rather than CSS, so `MotionConfig`
              covers it (`src/components/AGENTS.md`). */}
          <m.div
            ref={adopt}
            animate={{ opacity: 1 }}
            className={contentClass}
            data-sy-frame=""
            initial={{ opacity: 0 }}
            style={{ top }}
            transition={{ duration: 0.15 }}
          >
            <Primitive.Title className="sr-only">{title}</Primitive.Title>
            {/* Held back until the ref above has published this node, so the first drawer
                portals inside the dialog rather than beside it. */}
            {node && children}
          </m.div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}

// ===== THE VIEW ===== //

/**
 * Over the inline map's top-left corner — physically left, since the attribution and the
 * locate control hold the top right and the wordmark the bottom right. A framed embed cannot
 * grow where it is, so there the button opens a page that fits, in a new tab.
 */
function ExpandButton() {
  const { t } = useLocale()
  const { standalone } = useWidgetMode()
  const { expand } = useExpansion()
  const className = 'absolute top-3 left-3 z-10 border-divider bg-background shadow-lg'
  const label = (
    <>
      <Expand size={16} />
      {t('common.map.expand')}
    </>
  )

  // Two JSX branches, not a conditional `href`: `ButtonProps` is a discriminated union, so a
  // maybe-undefined href does not narrow into the anchor arm.
  return standalone ? (
    <Button
      className={className}
      href={fallbackUrl()}
      radius="full"
      size="sm"
      target="_blank"
      variant="bordered"
    >
      {label}
    </Button>
  ) : (
    <Button className={className} radius="full" size="sm" variant="bordered" onClick={expand}>
      {label}
    </Button>
  )
}

function InlineLayout({ hasMap }: { hasMap: boolean }) {
  const { t } = useLocale()
  const { pathname } = useLocation()
  const { expanded, collapse } = useExpansion()
  const host = useMemo(hostElement, [])
  const [level] = useState<'h1' | 'h2'>(() => (pageHasHeading(host) ? 'h2' : 'h1'))
  const [stickTop, setStickTop] = useState(() => headerOffset(host, 'stuck'))
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const boxed = useGrowHost(host, content)
  const heading = useRef<HTMLDivElement>(null)
  const lastPath = useRef(pathname)
  // Read when the map opens, not at mount: a header can hide on scroll, or wrap to two lines.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measured on each opening, never in between
  const dialogTop = useMemo(() => (expanded ? headerOffset(host, 'now') : 0), [expanded])
  const top = boxed ? 0 : stickTop

  // A header's height moves at the host's own breakpoints.
  useEffect(() => {
    const measure = () => setStickTop(headerOffset(host, 'stuck'))

    window.addEventListener('resize', measure)

    return () => window.removeEventListener('resize', measure)
  }, [host])

  // A new view starts at its own top: opening a city from the bottom of a long list would
  // otherwise leave the visitor looking at the middle of the next page. A view reached in the
  // expanded map is waiting when it closes.
  useEffect(() => {
    if (pathname === lastPath.current || expanded) return
    lastPath.current = pathname

    const element = heading.current

    if (element && element.getBoundingClientRect().top < top) element.scrollIntoView()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a navigation, or closing the map after one, is the only trigger
  }, [pathname, expanded])

  // Side by side from a 720px-wide widget, measured on the widget rather than the window (#107).
  // A narrower one stacks a short map strip above the content, and it does not stick.
  const columns = (
    <div className={clsx('grid gap-4', hasMap && '@min-[720px]:grid-cols-2')}>
      <DrawerStack inline />
      {hasMap && (
        <div className="order-first px-4 @min-[720px]:order-none @min-[720px]:ps-0">
          <div
            // ⚠ `contain: layout` makes this box the containing block for the canvas, which is
            // fixed. `transform-gpu` gives WebKit's compositor the same box to clip it to (#424).
            // The square is capped to what fits below the header, so all of it stays in view.
            className="relative h-[clamp(180px,33vh,320px)] transform-gpu overflow-clip rounded-2xl border border-divider [contain:layout] @min-[720px]:sticky @min-[720px]:ms-auto @min-[720px]:aspect-square @min-[720px]:h-auto @min-[720px]:max-w-[calc(100vh-var(--sy-inline-top,0px)-32px)]"
            style={{ top: top + 16, '--sy-inline-top': `${top}px` } as CSSProperties}
          >
            {/* The expanded dialog runs its own map, and two maps would fight over the one
                camera-settled flag; this one comes back, and re-frames, on collapse. */}
            {!expanded && <MapLayer cooperative={embed.config.cooperative} />}
            <ExpandButton />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <div
        className={clsx(
          '@container w-full bg-background text-foreground',
          boxed && 'h-full overflow-y-auto',
        )}
        // Behind the expanded map, the page's copy of the same view stays mounted, so closing
        // returns to it. `inert` takes it out of reach entirely: the modal's own hiding skips
        // any subtree holding a live region, and a loading view holds one.
        inert={expanded}
      >
        <div ref={setContent} className="flex flex-col gap-2 py-4">
          <div
            ref={heading}
            className="flex items-center gap-3 px-4"
            style={{ scrollMarginTop: top + 16 }}
          >
            <PlaceHeading level={level} />
            <SettingsMenu toolbar className="ms-auto" />
          </div>
          {hasMap ? (
            <MapProvider>
              <RealMapControllerProvider inline>{columns}</RealMapControllerProvider>
            </MapProvider>
          ) : (
            <NoopMapControllerProvider>{columns}</NoopMapControllerProvider>
          )}
        </div>
      </div>
      {hasMap && (
        <ExpandedDialog
          open={expanded}
          // The same name the widget's own landmark carries: a dialog whose accessible name
          // resolves empty is announced as an unlabelled group.
          title={t('common.chrome.widget_label')}
          top={dialogTop}
          onOpenChange={(next) => {
            if (next) return

            // `ReportIssueModal` is mounted OUTSIDE this branch but portals through
            // `overlayContainer()`, which is this dialog while it is open. Closing with the modal
            // up would leave it rendering into a detached node with its scroll lock still on.
            useReportModal.getState().closeReport()
            collapse()
          }}
        >
          <MapInterface hasMap />
        </ExpandedDialog>
      )}
    </>
  )
}

export type InlineEmbedViewProps = {
  hasMap: boolean
  homePath?: string
  primaryDomain?: string
}

function InlineEmbedView({ hasMap, homePath, primaryDomain }: InlineEmbedViewProps) {
  useInterfaceBoot({ homePath, primaryDomain })

  return (
    <LocalExpansionProvider>
      <InlineLayout hasMap={hasMap} />
    </LocalExpansionProvider>
  )
}

export default InlineEmbedView
