import {
  type CSSProperties,
  type ReactNode,
  Activity,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import { m } from 'framer-motion'
import { useLocation, useNavigationType } from 'react-router'
import { useQuery } from '@tanstack/react-query'
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
import { useOpenerRestore } from '@/hooks/use-opener-restore'
import { usePublishedNode } from '@/hooks/use-published-node'
import { fallbackUrl } from '@/lib/fallback-url'
import { publishFit } from '@/lib/readiness'
import { reportIntegrationWarning } from '@/lib/report'
import { setFrame, widgetOverlayContainer } from '@/lib/overlay'
import { DrawerStack } from '@/views/DrawerStack/DrawerStack'
import {
  type InterfaceProps,
  MapInterface,
  MapLayer,
  MapProviders,
  useInterfaceBoot,
} from '@/views/FullInterface'
import { type Box, MIN_INLINE_HEIGHT_PX, MIN_INLINE_WIDTH_PX } from '@/views/InlineEmbedView/fit'
import { headingPlace } from '@/views/InlineEmbedView/heading-place'
import {
  hostElement,
  pageHasHeading,
  useGrowHost,
  useHeaderOffset,
  useTooSmall,
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
 * It is the page's main heading only where the host's page has none of its own.
 */
export function PlaceHeading() {
  const { t, regionNames } = useLocale()
  const { pathname } = useLocation()
  const { data: tree } = useQuery(regionsQuery())
  const [Heading] = useState<'h1' | 'h2'>(() => (pageHasHeading(hostElement()) ? 'h2' : 'h1'))

  const place = useMemo(
    () => headingPlace(pathname, tree, (code) => regionNames.of(code)),
    [pathname, tree, regionNames],
  )

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
 * the map canvas, every drawer, the cog, "Close map" — is `position: fixed`, and without it
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
function ExpandedDialog({ children }: { children: ReactNode }) {
  const { t } = useLocale()
  const { expanded: open, collapse } = useExpansion()
  // Read when the map opens, not at mount: a header can scroll away, or wrap to two lines.
  const top = useHeaderOffset(hostElement(), 'now', open)
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
    <Primitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return

        // `ReportIssueModal` is mounted OUTSIDE this branch but portals through
        // `overlayContainer()`, which is this dialog while it is open. Closing with the modal
        // up would leave it rendering into a detached node with its scroll lock still on.
        useReportModal.getState().closeReport()
        collapse()
      }}
    >
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
            {/* The same name the widget's own landmark carries: a dialog whose accessible name
                resolves empty is announced as an unlabelled group. */}
            <Primitive.Title className="sr-only">{t('common.chrome.widget_label')}</Primitive.Title>
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
 * locate control hold the top right and the wordmark the bottom right — or under the heading of
 * an atlas too small for its box.
 *
 * A frame cannot grow where it is — the standalone page framed, or a host page that is itself
 * framed — so there the button opens a page that fits, in a new tab. So does a map-less atlas,
 * which has no map of its own to expand.
 */
function ExpandButton({ className }: { className?: string }) {
  const { t } = useLocale()
  const { standalone, hasMap } = useWidgetMode()
  const { expand } = useExpansion()
  const props = { className, radius: 'full', size: 'sm', variant: 'floating' } as const
  const label = (
    <>
      <Expand size={16} />
      {t('common.map.expand')}
    </>
  )

  // Two JSX branches, not a conditional `href`: `ButtonProps` is a discriminated union, so a
  // maybe-undefined href does not narrow into the anchor arm.
  return standalone || !hasMap || embed.observed?.topLevel === false ? (
    <Button {...props} href={fallbackUrl()} target="_blank">
      {label}
    </Button>
  ) : (
    <Button {...props} onClick={expand}>
      {label}
    </Button>
  )
}

/**
 * The inline embed's body: the content column, and the square map box beside it from
 * `--container-sy-cols` wide, measured on the widget rather than the window (#107). A narrower one
 * stacks a short map strip above the content, and it does not stick. `top` is the host header the
 * map sticks below.
 *
 * The view stories render one view in it, which is why it takes its content as children.
 */
export function InlineColumns({
  map,
  top = 0,
  children,
}: {
  map: ReactNode
  top?: number
  children: ReactNode
}) {
  const { hasMap } = useWidgetMode()

  return (
    <div className={clsx('grid gap-4', hasMap && '@min-sy-cols:grid-cols-2')}>
      {/* The page heading sets the width here, so the bands' own cap is lifted. */}
      <div className="flex min-w-0 flex-col [--sy-content-max:none]">{children}</div>
      {hasMap && (
        <div className="order-first px-gutter @min-sy-cols:order-none @min-sy-cols:ps-0">
          <div
            // ⚠ `contain: layout` makes this box the containing block for the canvas, which is
            // fixed. `transform-gpu` gives WebKit's compositor the same box to clip it to (#424).
            // The square is capped to what fits below the header, so all of it stays in view.
            className="relative h-[clamp(180px,33vh,320px)] transform-gpu overflow-clip rounded-2xl border border-divider [contain:layout] @min-sy-cols:sticky @min-sy-cols:top-[calc(var(--sy-inline-top,0px)+16px)] @min-sy-cols:ms-auto @min-sy-cols:aspect-square @min-sy-cols:h-auto @min-sy-cols:max-w-[calc(100vh-var(--sy-inline-top,0px)-32px)]"
            style={{ '--sy-inline-top': `${top}px` } as CSSProperties}
          >
            {map}
            <ExpandButton className="absolute top-3 left-3 z-10" />
          </div>
        </div>
      )}
    </div>
  )
}

const tooSmallMessage = ({ width, height }: Box) =>
  `this embed has ${width}×${height}px, under the ${MIN_INLINE_WIDTH_PX}px width the atlas needs ` +
  `(and ${MIN_INLINE_HEIGHT_PX}px of height where the page cannot let it grow), so it shows only ` +
  'its heading and "Expand map". Give the element more room to show the classes — see ' +
  '"Sizing the element" in the embedding guide.'

function InlineLayout() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const { hasMap } = useWidgetMode()
  const { expanded } = useExpansion()
  const host = useMemo(hostElement, [])
  const stickTop = useHeaderOffset(host, 'stuck')
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const boxed = useGrowHost(host, content)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const small = useTooSmall(box, boxed)
  const heading = useRef<HTMLDivElement>(null)
  const lastPath = useRef(pathname)
  // Whether a navigation since the heading was last placed opened a view. A replace — the home
  // redirect, a filter — opens none, but one after a push in the expanded map must not hide it.
  const opened = useRef(false)
  const top = boxed ? 0 : stickTop
  // Behind the expanded map the content column is hidden, so the page keeps the height it had,
  // and the visitor keeps their place in it.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measured once, at each opening
  const pinnedHeight = useMemo(() => (expanded ? content?.offsetHeight : undefined), [expanded])

  // Told to the verifier, and to whoever reads the host's console: they can give it the room.
  useEffect(() => {
    publishFit(small)
    if (small) reportIntegrationWarning(tooSmallMessage(small))
  }, [small])
  useEffect(() => () => publishFit(undefined), [])

  useEffect(() => {
    if (pathname !== lastPath.current && navigationType !== 'REPLACE') opened.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- each path change is read once, with the navigation that made it
  }, [pathname])

  // A new view starts at its own top: opening a city from the bottom of a long list would
  // otherwise leave the visitor looking at the middle of the next page. A view reached in the
  // expanded map is waiting when it closes.
  useEffect(() => {
    if (pathname === lastPath.current || expanded) return
    lastPath.current = pathname
    if (!opened.current) return
    opened.current = false

    const element = heading.current

    if (element && element.getBoundingClientRect().top < top) element.scrollIntoView()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a navigation, or closing the map after one, is the only trigger
  }, [pathname, expanded])

  return (
    <>
      <div
        ref={setBox}
        className={clsx(
          '@container w-full bg-background text-foreground',
          boxed && 'h-full overflow-y-auto',
        )}
      >
        {small ? (
          // Too small to browse in: the place, and the way to an atlas that fits.
          <div ref={setContent} className="flex flex-col items-start gap-3 p-4">
            <PlaceHeading />
            <ExpandButton />
          </div>
        ) : (
          <div
            ref={setContent}
            className="flex flex-col gap-2 py-4"
            style={{ minHeight: pinnedHeight }}
          >
            <div
              ref={heading}
              className="flex items-center gap-3 px-gutter"
              style={{ scrollMarginTop: top + 16 }}
            >
              <PlaceHeading />
              {/* Only without a map: with one, settings sit in the map's own control column
                  (`Mapbox/MapControls`), and a second cog here would be the same menu twice.
                  The negative end margin puts the 20px glyph, not its 32px (44px on touch) box,
                  on the row's gutter, in line with the map's edge below. */}
              {!hasMap && (
                <SettingsMenu className="ms-auto -me-1.5 pointer-coarse:-me-3" variant="ghost" />
              )}
            </div>
            <MapProviders inline>
              <InlineColumns
                // The expanded dialog runs its own map, and two maps would fight over the one
                // camera-settled flag; this one comes back, and re-frames, on collapse.
                map={!expanded && <MapLayer cooperative={embed.config.cooperative} />}
                top={top}
              >
                {/* Hidden while the expanded map shows the same view: its effects would frame a
                  map that is not there and write the stores the expanded one reads, and its
                  live regions would speak from behind the modal. Its state is kept for the way
                  back. */}
                <Activity mode={expanded ? 'hidden' : 'visible'}>
                  <DrawerStack inline />
                </Activity>
              </InlineColumns>
            </MapProviders>
          </div>
        )}
      </div>
      {hasMap && (
        <ExpandedDialog>
          <MapInterface />
        </ExpandedDialog>
      )}
    </>
  )
}

function InlineEmbedView(props: InterfaceProps) {
  useInterfaceBoot(props)

  return (
    <LocalExpansionProvider>
      <InlineLayout />
    </LocalExpansionProvider>
  )
}

export default InlineEmbedView
