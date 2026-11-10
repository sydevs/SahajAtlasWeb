import type { AgnosticFeedEvent } from '@/types'

import {
  type CSSProperties,
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { MapIcon, Plus } from 'lucide-react'
import clsx from 'clsx'

import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import embed from '@/config/embed'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useCalendarView } from '@/hooks/use-calendar-view'
import { useExpansion } from '@/hooks/use-expansion'
import { useLocale } from '@/hooks/use-locale'
import { Button } from '@/components/atoms/Button'
import { Drawer, DrawerContent } from '@/components/atoms/Drawer'
import { ResetErrorBoundary, SettingsMenu } from '@/components/molecules'
import { ClientGate } from '@/config/client-gate'
import {
  FILTER_PANEL_PX,
  SEARCH_SHEET_PX,
  WidgetWidthContext,
  useFitsWidth,
  useIsShortViewport,
  useIsWide,
} from '@/config/responsive'
import { useSurfaceSwitch, useWidgetMode } from '@/config/mode'
import { MAP_BUTTON } from '@/config/review-options'
import { useBrowsedCountry, useClassSheet, useFilterPanelState, useMapTap } from '@/config/store'
import { frameElement, overlayContainer } from '@/lib/overlay'
import { scheduleIdle } from '@/lib/schedule-idle'
import {
  filtersFromParams,
  climbDestination,
  type StackEntry,
  CALENDAR_VIEW_LIST,
  atlasDepth,
  dismissAction,
  addClassPath,
  baseStackEntry,
  filterCloseTarget,
  isFilterOverlay,
  isSubmitEntry,
  isoCountryCode,
  parentOf,
  submitTitleKey,
  placeInStack,
  placedPathname,
  resolveStack,
} from '@/lib/shape'
import { wakesSheetLoop } from '@/views/DrawerStack/sheet-wake'
import { openStop, sheetOpens } from '@/views/DrawerStack/sheet-open'
import { ViewLayer } from '@/views/DrawerStack/ViewLayer'
import { DrawerControlContext, FilterPanelAvailableContext, useClimbInputs } from '@/views/shared'
import { useFitSnap } from '@/views/DrawerStack/use-fit-snap'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { SearchView } from '@/views/SearchView/SearchView'
import { FilterView } from '@/views/FilterView/FilterView'
import { FilterChipBar } from '@/views/FilterView/FilterChipBar'
import { FiltersPanel } from '@/views/FilterView/FiltersPanel'
import { RegionView } from '@/views/RegionView/RegionView'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { EventView } from '@/views/EventView/EventView'

// The three views most visitors never open, split out of the eager graph (issue #96). Each
// one is the only consumer of a large dependency the widget would otherwise pay for at first
// paint on every host page. The calendar owns the whole Schedule-X stack — its grid, its
// views, its theme CSS. Registration owns react-hook-form plus the resolver. Share owns
// react-share's target composers.
//
// These are the RIGHT three to split, because none of them can be the first thing on screen
// by accident. Each is reached by pressing something — the calendar button, an event's
// Register or Share action — or by a deep link that is already a deliberate act. The views
// that CAN be the entry point — the country index, a region, search, an event — stay eager,
// so the common path still resolves inside the graph the host already fetched.
//
// These are minted per attempt, not once at module scope, for the reason spelled out in
// `EventView.tsx`. React caches a lazy component's REJECTED payload forever. A module-scope
// `lazy` would leave the drawer boundary's "Try again" re-throwing the stored rejection
// instantly — the visibly-does-nothing button that issue #89 removed. The three are minted
// together, because one reset serves one boundary. A fresh `lazy` for a view that did not
// fail costs nothing, since the object stays inert until rendered, and only one of them is
// ever mounted at a time.
//
// Share is fetched in the background while a class is open (see `scheduleIdle` below), so a tap
// on Share opens its panel at once, with no loading step before it (Anton, 6 Nov). A failed
// background fetch is ignored: the tap then loads it as before, through the lazy view and its
// boundary.
const importShareView = () => import('@/views/ShareView/ShareView')
const loadSecondaryViews = () => ({
  CalendarView: lazy(() =>
    import('@/views/CalendarView/CalendarView').then((m) => ({ default: m.CalendarView })),
  ),
  RegistrationView: lazy(() =>
    import('@/views/RegistrationView/RegistrationView').then((m) => ({
      default: m.RegistrationView,
    })),
  ),
  ShareView: lazy(() => importShareView().then((m) => ({ default: m.ShareView }))),
  // The add-a-class and correction flows (#147), in the stack's own sheet like any other view.
  SubmitView: lazy(() =>
    import('@/views/SubmitView/SubmitView').then((m) => ({ default: m.SubmitView })),
  ),
})

type SecondaryViews = ReturnType<typeof loadSecondaryViews>

// The mobile bottom-sheet snap ladder, ascending. vaul reads a string as pixels, and a
// number as a fraction of the sheet height:
//  - '104px' peek — the handle plus the first screen's title row, or the Back row and one line
//            of title (ViewLayer clamps the title to one line there), with 8px below it
//  - '356px' the Back row, title, breadcrumbs, a list row, and a peek of the next
//  - '380px' the first screen: its ways in, plus enough of the country list to show there is one
//  - 440px   a searched place: enough to see its classes and that other groups follow
//  - 0.97    near-full
const SEARCH_SNAP = `${SEARCH_SHEET_PX}px` // a searched place: the answer, and the groups below it
// The handle's 28px, the 32px Back row, the 10px under it (NavRow's `mb-2`), a 26px title line and
// 8px to spare. At 88px, before NavRow's gap, the title's lower half fell off the screen.
const PEEK_PX = 104
const PEEK_SNAP = `${PEEK_PX}px` // the collapsed peek
const NEAR_FULL_SHARE = 0.97 // the near-full stop, as a share of the screen
const SNAP_POINTS = [PEEK_SNAP, '356px', '380px', SEARCH_SNAP, NEAR_FULL_SHARE]
const OPEN_SNAP = '356px' // default, and what the peek expands to
const HOME_SNAP = '380px' // what the first screen opens at
const WIDE_SNAP = SNAP_POINTS[SNAP_POINTS.length - 1] // the near-full snap the full-width calendar opens at
// Stands for "as tall as the content" in `snap`. The pixel value moves with the content, so
// the state holds this token and the ladder carries the live number (`useFitSnap`).
const FIT_SNAP = 'fit'
// A class opens as tall as its whole content and its footer, capped at the near-full snap
// (`useFitSnap`, as the filters do): the visitor tapped it to read it, with no blank sheet below
// (Anton, 6 Nov). One drag down, it stops at the height its key facts need, measured by
// EventView's `useSheetFit`: the title, when, where and chips, above a sticky footer of about
// 125px, with the map and its pin above. Until that measure lands, this is the first guess. The footer
// also grows by the home-indicator inset, so the guess does too. vaul reads pixels, so the
// inset is measured once, from the same CSS value the footer's spacer uses.
const EVENT_OPEN_PX = 380
const safeAreaBottom = (): number => {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')

  probe.style.cssText = 'position:fixed;visibility:hidden;height:env(safe-area-inset-bottom,0px)'
  document.body.append(probe)
  const inset = probe.getBoundingClientRect().height

  probe.remove()

  return inset
}

// On a phone on its side (`useIsShortViewport`), the map's controls run as a row along the top,
// and the 356px and taller stops covered it on a 375px screen, or ran the sheet's top off the
// screen. There every stop stays this far below the top of the window: the row and a strip of map,
// as round 1's 300px stop left on a 375px screen.
const ABOVE_SHEET_WHEN_SHORT_PX = 75

// In a host's box, 300px shows three rows, or a class's title and a clipped time. This shows
// five rows, or a class's when, where and register button, and still leaves some map.
const DETAIL_SNAP = '400px'
// The whole box. The 97% stop a phone uses would leave a sliver of map here, with the cog and
// the locate button half under the sheet.
const FRAMED_FULL_SNAP = 1
const FRAMED_SNAP_POINTS = [PEEK_SNAP, OPEN_SNAP, DETAIL_SNAP, FRAMED_FULL_SNAP]
// Under this, DETAIL_SNAP would leave a sliver of map.
const DETAIL_SNAP_MIN_FRAME_PX = 520

/** PROTOTYPE. Whether every class under this path is a contact-only listing. */
function isContactOnlyPage(
  features: { properties: AgnosticFeedEvent }[],
  path: string | undefined,
) {
  if (!path || path === '/') return false
  const under = features.filter(
    ({ properties: { webPath } }) => webPath === path || webPath?.startsWith(`${path}/`),
  )

  return under.length > 0 && under.every(({ properties }) => properties.contactOnly)
}

/**
 * Where the sheet opens for a view. In a host's box (or the compact dialog), a form or a class
 * cannot share the height with the map the way it can on a phone. The map is one swipe away.
 */
function openSnapFor(kind: StackEntry['kind'] | undefined, frameHeight: number) {
  if (frameHeight === 0) return kind === 'calendar' ? WIDE_SNAP : OPEN_SNAP
  if (kind === 'calendar' || kind === 'register' || kind === 'filters') return FRAMED_FULL_SNAP
  if (frameHeight >= DETAIL_SNAP_MIN_FRAME_PX) return DETAIL_SNAP

  return kind === 'event' ? FRAMED_FULL_SNAP : OPEN_SNAP
}

/** A pixel stop held down to `cap`. Fractions, and every stop when there is no cap, pass through. */
function capStop(point: number | string, cap: number | null) {
  return cap !== null && typeof point === 'string' && parseFloat(point) > cap ? `${cap}px` : point
}

/** The phone ladder with the filters' fit-to-content stop slotted in by height. */
function withFitSnap(points: (number | string)[], fitPx: number | null) {
  if (fitPx === null) return points
  const px = (p: number | string) => (typeof p === 'string' ? parseFloat(p) : Infinity)

  if (points.some((p) => px(p) === fitPx)) return points
  const at = points.findIndex((p) => px(p) > fitPx)

  return [...points.slice(0, at), `${fitPx}px`, ...points.slice(at)]
}

// How wide the widget has to be before the filters get their own panel over the map, and open by
// default: the 352px list and its margins, the filter panel (`FILTER_PANEL_PX`) and the map
// controls beside it, which leaves about 430px of map to look at. Below this, filters sit behind
// the button.
const FILTER_PANEL_MIN_PX = 1200
// The settings cog's share of `CONTROLS_BESIDE_PANEL` in Map.tsx: the cog sits outside the map.
const COG_BESIDE_PANEL = { '--sy-map-end': `${FILTER_PANEL_PX}px` } as CSSProperties

// PROPOSAL SWITCH: the panel and the chip bar are an either/or for Anton to compare. `?filterui=chips`
// on the page's first load shows the chips. Delete whichever one loses, and this with it.
const DESKTOP_FILTERS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('filterui') === 'chips'
    ? 'chips'
    : 'panel'

// The floating panel's 16px margin above and below, and its 1px border top and bottom.
const PANEL_MARGIN_PX = 32
const PANEL_BORDER_PX = 2

// Where the floating "Add a class" button sits on a wide layout: the map's bottom-right corner,
// the one the side panel leaves clear (the top right holds the locate button and the
// attribution). Mapbox's wordmark already sits there (`logoPosition` in `Map.tsx`), so the button
// stacks above it. mapbox-gl draws the wordmark 23px tall and 6px off the bottom edge — its
// corner's 10px margin less the logo's own -4px — so its top edge is 29px up. Neither moves, so
// these are constants rather than a measurement (`docs/rules/mapbox.md`).
const MAPBOX_WORDMARK_TOP_PX = 29
const ADD_CLASS_GAP_PX = 16 // from the map's right edge, and above the wordmark
// PROTOTYPE `?mapButton=float`: the room the panel's lists leave under their last row, so the
// floating "Map" pill never covers it (the body's spacer reads it; `atoms/Drawer`).
const PILL_ROOM = { '--sy-pill-room': '72px' } as CSSProperties

/** PROTOTYPE `?mapButton=float`: a dark "Map" pill floating over the foot of the open panel. */
function MapPill({ className, onClick }: { className: string; onClick: () => void }) {
  const { t } = useLocale()

  return (
    <button
      className={clsx(
        'z-50 flex h-11 items-center gap-2 rounded-full bg-gray-12 px-5 text-sm font-semibold text-gray-1 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        className,
      )}
      type="button"
      onClick={onClick}
    >
      <MapIcon aria-hidden size={18} />
      {t('common.map.map')}
    </button>
  )
}

// The docked add-a-class panel: the right-hand drawer, sized to its content and lifted to the
// "Add a class" button's corner, so the flow opens where it was asked for. Its top stays below the
// map's control column (settings and attribution, 120px), so a long step scrolls inside instead.
// Tailwind reads only literal classes, so the 45px is `MAPBOX_WORDMARK_TOP_PX + ADD_CLASS_GAP_PX`
// written out, and 165px adds the 120px: change them together.
const SUBMIT_PANEL =
  '!top-auto !right-4 !bottom-[45px] !h-auto max-h-[calc(var(--sy-frame-h)_-_165px)] rounded-2xl shadow-xl lg:!top-auto lg:!bottom-[45px]'

// What a tap on the sheet leaves alone: anything that acts on its own when tapped.
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="combobox"], [role="tab"], [role="radio"], [role="checkbox"], [role="slider"]'

// Physical `right`, not the logical end: the wordmark is bottom-right in either direction.
const ADD_CLASS_CORNER: CSSProperties = {
  position: 'fixed',
  right: ADD_CLASS_GAP_PX,
  bottom: MAPBOX_WORDMARK_TOP_PX + ADD_CLASS_GAP_PX,
}

// Frames a stationary sheet holds before the `--sy-sheet-top` mirror parks itself (about
// 0.5s at 60fps — well past the end of any vaul spring). See the effect below for why it
// parks at all.
const IDLE_FRAMES = 30

type Direction = 'left' | 'bottom'

// Dispatches the active (top) view's inner content. Only the top view renders, so each
// view frames the map for its own level on mount.
//
// The three lazy views arrive as a prop, rather than being read from module scope, so
// the identity a boundary reset replaces is the one this renders — see `loadSecondaryViews`.
function TopView({
  entry,
  parentPath,
  secondary,
}: {
  entry: StackEntry | null
  parentPath: string
  secondary: SecondaryViews
}) {
  if (!entry) return <CountriesView />

  switch (entry.kind) {
    case 'search':
      return <SearchView />
    case 'calendar':
      return <secondary.CalendarView />
    case 'filters':
      return <FilterView />
    case 'region':
      return <RegionView slug={entry.slug} />
    case 'online':
      return <OnlineView path={entry.path} regionSlug={entry.regionSlug} />
    case 'event':
      return <EventView basePath={entry.path} id={entry.id} />
    case 'register':
      return <secondary.RegistrationView eventPath={entry.eventPath} parentPath={parentPath} />
    case 'share':
      return <secondary.ShareView eventPath={entry.eventPath} />
    case 'add':
    case 'correct':
      return <secondary.SubmitView entry={entry} />
  }
}

/** A search field whose suggestion list is showing — the one control that owns Escape. */
const isOpenSuggestionList = (node: EventTarget) =>
  node instanceof Element && node.matches('input[aria-expanded="true"]')

/**
 * The add-a-class flow's way in on a wide map (#147): a filled button in the map's bottom-right
 * corner that opens the flow over the place on screen. The row at the foot of a list sits below
 * the fold on a long one, so this keeps the way in on screen. A phone keeps that row alone, since
 * a floating button there would sit on the bottom sheet.
 *
 * An in-widget push, like the list row's link, so the flow's X comes back here. The visible label
 * is the flow's own title; the accessible name adds the place, and starts with that label, so a
 * voice command reading the button still matches it.
 */
function AddClassButton({
  href,
  label,
  accessibleName,
}: {
  href: string
  label: string
  accessibleName: string
}) {
  const navigate = useAtlasNavigate()

  return (
    <Button
      aria-label={accessibleName}
      // Above the map and its controls, below any drawer (`z-40`) that could ever reach this
      // corner. Sized up from the `md` control to a 44px touch target.
      className="z-30 h-11 px-5 text-base font-semibold shadow-lg"
      color="primary"
      radius="full"
      style={ADD_CLASS_CORNER}
      variant="solid"
      onClick={() => navigate(href)}
    >
      <Plus aria-hidden size={20} />
      {label}
    </Button>
  )
}

// The whole drawer navigation, derived purely from the pathname. ONE persistent vaul
// drawer holds the active (top) view, and the way back is its header's Back button (issue
// #30 stacked the ancestors behind it as peek strips, which this replaced). The sheet
// renders once — DrawerStack owns the DrawerContent, and views
// are just its inner content. So navigating never remounts or re-slides the drawer. The
// inner content cross-fades instead. Every view is handled the same way: dismissing
// navigates to the parent, and the one view with no parent (CountriesView) collapses to
// its peek instead of closing. Direction is left at ≥md, bottom on mobile. Map-less, the
// single drawer fills the widget container.
export function DrawerStack() {
  const location = useLocation()
  // Reads off the location rather than through `useSearchParams`, which would add a
  // second subscription for a value this component already re-renders on.
  const searchCenter = new URLSearchParams(location.search).get('center')
  const navigate = useNavigate()
  const { hasMap, standalone } = useWidgetMode()
  const surfaceSwitch = useSurfaceSwitch()
  // PROTOTYPE `?mapButton=float` (`config/review-options`): a "Map" pill floats at the foot of
  // the open panel, in place of the list-first view's "Show map" row, so only where that view's
  // switch exists (`?view=list`); the plain map page has no such row. Over the list it opens the
  // map; on the map side it shows only when the sheet is fully open, and folds it down to the map.
  const pillPlacement = surfaceSwitch && MAP_BUTTON === 'float'
  // `t` comes off `useLocale`, not a second `useTranslation` call: the hook already
  // holds one for the default (`common`) namespace, and hands it back for exactly this
  // reason. A second call would double this component's i18next subscription, and
  // DrawerStack re-renders on every URL change.
  const { t } = useLocale()
  // Read unconditionally, like every other seam consumer: with no surface above this
  // component, it is the no-op provider, and the Escape ladder below simply ends where
  // it always did.
  const { collapse } = useExpansion()
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  // How wide the WIDGET is, not the screen (issue #107). `container` is the map-less layout
  // root below — the box the host sized. In map mode there is no such element. Until #169,
  // there was nothing to measure at all. The widget spanned the viewport, so `useIsWide`
  // fell back to it. Now map mode can have a FRAME — a contained embed's own box, or the
  // compact card's expanded dialog. Where one exists, it is the honest answer to "does a
  // 352px side panel leave usable space beside it?", because the panel sits inside it. With
  // no frame, this call is `useIsWide(null)`, exactly what it always computed. So a 320px
  // column embed on a desktop gets the bottom sheet, its drag handle, and its
  // swipe-dismiss — and a 600px contained map now does too. This value is shared with the
  // subtree via `WidgetWidthContext` at the foot of this component, so no descendant can
  // disagree with the drawer it sits in.
  const isWide = useIsWide(container ?? frameElement())
  // Zero means no frame: the sheet is measured against the window, as on a phone.
  const frameHeight = hasMap ? (frameElement()?.offsetHeight ?? 0) : 0
  const direction: Direction = isWide ? 'left' : 'bottom'
  const [snap, setSnap] = useState<number | string | null>(OPEN_SNAP)
  const filterPanelFits = useFitsWidth(container ?? frameElement(), FILTER_PANEL_MIN_PX)
  const filterPanelOpen = useFilterPanelState((s) => s.open)
  const setFilterPanelOpen = useFilterPanelState((s) => s.setOpen)
  const filterPanelUp = useFilterPanelState((s) => s.onScreen)
  // A fixed origin on the sheet's layer, which the live-top loop measures against (see there).
  const sheetOriginRef = useRef<HTMLDivElement>(null)
  // The lazy components ARE the retry state — the boundary's reset swaps in fresh ones.
  // Same shape, and the same reasoning, as EventView's `EventDetails`.
  const [secondary, setSecondary] = useState(loadSecondaryViews)

  const entries = useMemo(() => resolveStack(location.pathname), [location.pathname])
  // Filters over the full-width calendar (map mode) render as a separate modal drawer
  // OVER the still-mounted calendar — from the right at ≥md, a bottom sheet on mobile —
  // rather than replacing it. So the calendar stays the base view, and the trailing
  // `filters` entry peels off into the overlay below. (Map-less keeps the plain
  // replace-stack behaviour.)
  const filterOverlay = isFilterOverlay(entries, hasMap) && embed.config.filters
  // On a wide map the add-a-class and correction flows open in a panel docked at the map's bottom
  // right, where the "Add a class" button sits, over the page they were opened from (Anton, 6 Nov,
  // after Devindra's placement in #318). The page stays as it was behind them. A phone keeps them
  // in the sheet.
  const submitEntry = entries.at(-1)
  const submitOverlay = hasMap && isWide && isSubmitEntry(submitEntry)
  const baseEntries = useMemo(
    () => (filterOverlay || submitOverlay ? entries.slice(0, -1) : entries),
    [filterOverlay, submitOverlay, entries],
  )
  // The region tree is already cached by the bootstrap. It names the place the floating
  // "Add a class" button opens the flow over.
  const { data: regions } = useQuery(regionsQuery())

  // Reads through `baseStackEntry` rather than the last non-overlay entry — the same value
  // either way, but stated in the shared vocabulary, so `top.path` is provably
  // `topViewKey(location.pathname, hasMap)`. `useFrameOnTop` compares itself against
  // that key to tell whether it is still the view on top, and the two agreeing is what
  // makes the comparison mean anything.
  const top = (submitOverlay ? baseEntries.at(-1) : baseStackEntry(entries, hasMap)) ?? null
  const climb = useClimbInputs()
  const { data: feed } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
    enabled: hasMap,
  })
  const contactOnlyPage = useMemo(
    () => isContactOnlyPage(feed?.features ?? [], top?.path),
    [feed, top?.path],
  )
  // In a host's box (or for a contact-only page), the sheet takes the framed ladder: a form or
  // a class cannot share the height with the map the way it can on a phone.
  const framed = frameHeight > 0 || contactOnlyPage
  // The stop that fills the screen: the whole box when framed, 97% on a phone.
  const fullSnap = framed ? FRAMED_FULL_SNAP : WIDE_SNAP
  // A class has its own taller open stop. The stored snap can still be the previous view's
  // for one render, before the effect below moves it, and vaul needs one from this ladder.
  const [fallbackOpenPx] = useState(() => EVENT_OPEN_PX + safeAreaBottom())
  const [measuredOpenPx, setMeasuredOpenPx] = useState<number | null>(null)
  const eventOpenPx = measuredOpenPx ?? fallbackOpenPx
  const eventOpenSnap = `${eventOpenPx}px`
  const eventSnapPoints = useMemo(() => [PEEK_SNAP, eventOpenSnap, WIDE_SNAP], [eventOpenSnap])
  // The fit-to-content snap for the filters, a class, its share panel and a place's list (phone
  // only: a host's box has its own ladder, where the filters fill it). Unmeasured, or as tall as
  // the near-full snap, it is null and FIT_SNAP falls back to the near-full snap.
  const fitPx = useFitSnap(
    direction === 'bottom' &&
      hasMap &&
      !framed &&
      ((top?.kind === 'filters' && !filterOverlay) ||
        top?.kind === 'event' ||
        top?.kind === 'share' ||
        top?.kind === 'region'),
    location.pathname,
  )

  // A class's Share opens at once: its code is fetched while the class is on screen.
  useEffect(() => {
    if (top?.kind !== 'event') return

    return scheduleIdle(() => void importShareView().catch(() => undefined))
  }, [top?.kind])
  const fitSnap = fitPx === null ? null : `${fitPx}px`
  const fitSnapPoints = useMemo(() => withFitSnap(SNAP_POINTS, fitPx), [fitPx])
  const eventFitSnapPoints = useMemo(
    () => withFitSnap(eventSnapPoints, fitPx),
    [eventSnapPoints, fitPx],
  )
  const snapPoints = framed
    ? FRAMED_SNAP_POINTS
    : top?.kind === 'event'
      ? eventFitSnapPoints
      : fitSnapPoints
  // The first screen has more to show before the map matters than any other view.
  const openSnap = framed
    ? contactOnlyPage
      ? FRAMED_FULL_SNAP
      : openSnapFor(top?.kind, frameHeight)
    : top?.kind === 'event'
      ? WIDE_SNAP
      : top
        ? OPEN_SNAP
        : HOME_SNAP
  // What vaul sees: the FIT_SNAP token resolved to its live pixel value.
  const vaulSnap = snap === FIT_SNAP ? (fitSnap ?? WIDE_SNAP) : snap
  const activeSnap = vaulSnap != null && snapPoints.includes(vaulSnap) ? vaulSnap : openSnap
  // A drag that lands on the fit stop stores the token, so the stop follows the content.
  const setVaulSnap = (next: number | string | null) =>
    setSnap(fitSnap !== null && next === fitSnap ? FIT_SNAP : next)
  // A short window caps the pixel stops (see ABOVE_SHEET_WHEN_SHORT_PX), only on the way to vaul:
  // `snap` keeps naming the logical stop, so everything that compares it stays as it is. The
  // near-full stop is a fraction, and still covers the row on purpose.
  const shortViewport = useIsShortViewport()
  const snapCap =
    shortViewport && direction === 'bottom' && !framed
      ? Math.max(PEEK_PX, window.innerHeight - ABOVE_SHEET_WHEN_SHORT_PX)
      : null
  // Memoised like the ladders it is built from: vaul re-measures every stop when this changes.
  const shownSnapPoints = useMemo(
    () =>
      snapCap === null ? snapPoints : [...new Set(snapPoints.map((p) => capStop(p, snapCap)))],
    [snapPoints, snapCap],
  )
  const shownSnap = capStop(activeSnap, snapCap)
  const setShownSnap = (next: number | string | null) => {
    // A capped stop stands for every stop above the cap: the sheet stays at the one it was at if
    // that caps to here, and otherwise opens at the usual open stop.
    if (snapCap !== null && next === `${snapCap}px` && !snapPoints.includes(next)) {
      if (shownSnap !== next) setSnap(openSnap)

      return
    }
    setVaulSnap(next)
  }
  // The calendar is the one full-width view. It fills the widget, minus the floating margins,
  // instead of the 352px left panel (see the Drawer `wide` variant) — EXCEPT in its list
  // (agenda) view, one narrow column that reads better at the regular width. `isWide` is here
  // because the wide panel exists only above the crossing; below it `wide` gates the settings
  // cog alone, which a phone in month view had lost (#331). The view is read reactively, so
  // switching it resizes the drawer. Date changes do not re-render this component.
  const calendarView = useCalendarView()
  const wide = top?.kind === 'calendar' && isWide && calendarView !== CALENDAR_VIEW_LIST
  // The panel belongs to the browsing views. A class page or a form has nothing to filter, and
  // the calendar keeps its own filter overlay.
  const filterPanelAvailable =
    embed.config.filters &&
    hasMap &&
    filterPanelFits &&
    (!top || top.kind === 'region' || top.kind === 'search')
      ? DESKTOP_FILTERS
      : null
  const routedFilters =
    top?.kind === 'filters' && (!embed.config.filters || (hasMap && filterPanelFits))
  // A list of online classes only: a place's Online classes, or results filtered to online. Online
  // classes have no place on the map, so the phone sheet opens near full rather than leaving a map
  // with nothing on it above the list (Anton, 6 Nov).
  const onlineOnly =
    top?.kind === 'online' ||
    (top?.kind === 'search' &&
      filtersFromParams(new URLSearchParams(location.search)).format === 'online')

  // A `/filters` link on a layout with the panel: open the panel, and show the view beneath it.
  useEffect(() => {
    if (!routedFilters) return

    if (embed.config.filters) setFilterPanelOpen(true)
    navigate(
      filterCloseTarget(location.pathname, location.search) ?? {
        pathname: parentOf(location.pathname) ?? '/',
        search: location.search,
      },
      { replace: true, state: location.state },
    )
    // Only the arrival on the route matters.
  }, [routedFilters])
  // What sits behind the top view follows the region tree, not the words typed. A place opens by
  // its last slug, so `/united-kingdom/south-east/london` shows London, and the stack behind it
  // must lead to the UK at `/gb`, not a `/united-kingdom` that doesn't exist. The top view keeps
  // the address as typed (`top.path` above).
  const ancestry = useMemo(() => {
    const placed = resolveStack(placedPathname(location.pathname, climb.pathOf))

    return filterOverlay || submitOverlay ? placed.slice(0, -1) : placed
  }, [location.pathname, climb.pathOf, filterOverlay, submitOverlay])
  // The country on screen, kept through the routes that name none (search, calendar), so the
  // place search a country page opens stays in that country. The world view clears it.
  const setBrowsedCountry = useBrowsedCountry((s) => s.setCode)

  useEffect(() => {
    const first = location.pathname.split('/')[1]
    const code = isoCountryCode(first)

    if (!first || code) setBrowsedCountry(code)
  }, [location.pathname, setBrowsedCountry])
  // Ancestor paths below the top view, root-first (empty at CountriesView).
  const parentPaths = useMemo(
    () => (ancestry.length === 0 ? [] : ['/', ...ancestry.slice(0, -1).map((e) => e.path)]),
    [ancestry],
  )
  const parentPath = parentPaths.at(-1)
  const canCollapse = hasMap && direction === 'bottom'

  // A tap on open map lowers the phone sheet to its peek, so the map the visitor reached for
  // comes into view. A drag or a pin doesn't count: the map only reports a plain tap.
  const mapTaps = useMapTap((s) => s.taps)
  const seenTaps = useRef(mapTaps)

  useEffect(() => {
    if (mapTaps === seenTaps.current) return
    seenTaps.current = mapTaps
    if (canCollapse) setSnap(PEEK_SNAP)
  }, [mapTaps, canCollapse])

  // The phone sheet comes up to meet the visitor (Anton, 6 Nov). Scrolling a list in a sheet that
  // isn't fully open scrolled it inside a short window, so the first scroll opens the sheet fully
  // instead. And a tap on the sheet itself (not on a link, button or field, and not the end of a
  // drag) raises it: from the peek to its open height, from there to fully open. Native
  // listeners, because `scroll` doesn't bubble; a ref for the snap, so they never rebind as it
  // moves. The element arrives through a callback ref: the sheet portals in once its target exists.
  // "Fully open" is as tall as the content when it is shorter than the near-full stop, so a raise
  // never opens a blank sheet below a short list or class (Anton, 6 Nov).
  const [sheetBody, setSheetBody] = useState<HTMLDivElement | null>(null)
  const raiseSnap = fitSnap !== null ? FIT_SNAP : fullSnap
  const raiseTo = useRef({ snap, openSnap, fullSnap, raiseSnap })

  raiseTo.current = { snap, openSnap, fullSnap, raiseSnap }

  useEffect(() => {
    const body = sheetBody

    if (!body || direction !== 'bottom' || !hasMap) return

    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement
      const { snap: now, fullSnap: full, raiseSnap: raise } = raiseTo.current

      if (
        now !== full &&
        now !== raise &&
        target.matches?.('[data-drawer-body]') &&
        target.scrollTop > 0
      ) {
        setSnap(raise)
      }
    }
    let down: { x: number; y: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY }
    }
    const onClick = (event: MouseEvent) => {
      const moved = down ? Math.hypot(event.clientX - down.x, event.clientY - down.y) : 0
      const target = event.target as HTMLElement

      if (moved > 8 || target.closest?.(INTERACTIVE)) return
      const { snap: now, openSnap: open, fullSnap: full, raiseSnap: raise } = raiseTo.current

      if (now === PEEK_SNAP) setSnap(open)
      else if (now !== full && now !== raise) setSnap(raise)
    }

    body.addEventListener('scroll', onScroll, true)
    body.addEventListener('pointerdown', onPointerDown)
    body.addEventListener('click', onClick)

    return () => {
      body.removeEventListener('scroll', onScroll, true)
      body.removeEventListener('pointerdown', onPointerDown)
      body.removeEventListener('click', onClick)
    }
  }, [sheetBody, direction, hasMap])

  const depth = atlasDepth(location)

  // The tall phone sheet for filters and their results reads as one sheet over a dimmed page,
  // with no half a cog above it. It all comes back once the sheet is dragged lower.
  const tallSheet =
    direction === 'bottom' &&
    (snap === WIDE_SNAP || snap === FIT_SNAP) &&
    (top?.kind === 'filters' || top?.kind === 'search')

  // Mirrors the active sheet's live top onto the sheet itself, every frame, so what reads
  // it tracks a drag without waiting for the snap to settle (map plus mobile only). It is
  // what pins EventView's sticky register bar to
  // the viewport edge — inside the transformed sheet, `position: fixed` resolves
  // against the sheet, so the bar offsets by the live top instead (issue #52, WS4).
  //
  // CSS anchor positioning cannot retire this loop, so no `build.target` raise does
  // either. `anchor()` is valid only in inset properties, and `Fallbacks`'
  // `CENTERED_BODY` reads this variable in `max-height`, so that consumer keeps the
  // loop running however high the floor goes. The two inset readers — the strip's
  // `top` above and `DrawerFooter`'s sticky `bottom` — could convert, which trades one
  // mechanism for two and deletes nothing.
  useEffect(() => {
    // This effect runs for every bottom-sheet view, root included. The strips and the sticky
    // register bar only exist above the root, but `--sy-sheet-top` now has a third consumer.
    // The error and loading bodies centre themselves within the VISIBLE sheet, and the root
    // can fail too, on a cold `['countries']` read. Without the variable there, they would
    // centre inside a body that is `h-dvh` tall while only its top 300px is on screen — below
    // the fold, which is the same bug that made both states invisible on mobile in the first
    // place (issue #89).
    if (!hasMap || direction !== 'bottom') return
    let raf = 0
    let still = 0
    let last = Number.NaN
    // This looks the sheet up lazily — it mounts with this effect — and caches it, so there
    // is no need to re-query the DOM every frame. `isConnected` is what makes caching safe
    // now that the effect no longer re-runs per depth change. Two elements carry
    // `[data-vaul-drawer]`, the main sheet and the filter overlay, so a resize across the md
    // breakpoint can leave this holding the overlay. Once that overlay closes, a detached
    // node measures `top: 0` and would write `--sy-sheet-top: 0px` onto the LIVE strips,
    // pinning every peek to the top.
    //
    // ⚠ **Scoped to this widget's own portal target, not `document`.** Both drawers portal
    // through `overlayContainer()` — the frame, or the theme root — never `document.body`,
    // whatever an older comment here claimed. A document-wide query reaches the HOST's DOM,
    // and vaul is a common shadcn dependency. A drawer of theirs, earlier in document order,
    // would win. This code would then write an inline `--sy-sheet-top` onto a host node
    // every frame, while this widget's own strips took their offset from somebody else's
    // box.
    let sheet: HTMLElement | null = null
    const tick = () => {
      if (!sheet?.isConnected) {
        sheet = (overlayContainer() ?? document).querySelector<HTMLElement>('[data-vaul-drawer]')
      }

      // No sheet still counts as a settled frame: counting it as movement would
      // re-arm the loop (and re-run the query) every frame forever, which is exactly
      // the cost this parks to avoid.
      if (!sheet) {
        still += 1
      } else {
        // This measures against the box the fixed layer resolves against, not the
        // viewport. `getBoundingClientRect().top` is a VIEWPORT coordinate. It is
        // consumed as `top:` on fixed peek strips and `bottom:` on the sticky Register
        // bar — both of which a frame contains (`contain: layout`). Left raw, every one
        // of them sat 16-32px out inside the expanded dialog, by exactly its margin.
        // Contained on a host's page (#169), the error becomes however far down their
        // page the element sits, which is unbounded. With no frame, the offset is zero,
        // so this stays the same number it always was.
        // This reads from the node the overlay module already tracks, NOT
        // `document.querySelector('[data-sy-frame]')`. That would search the host's
        // whole document, so an element of theirs carrying the attribute would win on
        // document order and offset every strip by its box. Its RECT is still read per
        // frame — the dialog's inset changes at the `sm:` crossing, and a contained
        // frame moves with the host's own scrolling — but the lookup itself is a module
        // read, not a query.
        // ⚠ This is guarded, like `decideSlot`'s read, and for the same reason. Hosts
        // patch `getBoundingClientRect` — consent wrappers, anti-fingerprinting
        // extensions. A THROW here would kill the loop permanently, because the `raf =`
        // reassignment below would never run, and then it would re-throw into the
        // host's `window.onerror` on every wake event. A `NaN` is worse than it looks.
        // `top === last` is never true, so `still` resets every frame and the loop
        // never parks, spending a forced layout flush per frame on somebody else's
        // page.
        let top = Number.NaN

        try {
          // ⚠ Read against a `fixed` origin on the same layer, not against the viewport. While
          // the iOS keyboard is up, Safari pans the page, and a rect read alone shifts by that
          // pan. The loop then parks on the panned value, because the pan ending fires nothing
          // that wakes it, and the peek strips stay stranded across the map as a see-through
          // panel. Both rects shift together, so the difference holds through a pan, and the
          // origin lands on a frame's edge where one contains the layer.
          const origin =
            sheetOriginRef.current?.getBoundingClientRect().top ??
            frameElement()?.getBoundingClientRect().top ??
            0

          top = sheet.getBoundingClientRect().top - origin
        } catch {
          top = Number.NaN
        }

        if (!Number.isFinite(top)) {
          still += 1
        } else if (top === last) {
          still += 1
        } else {
          still = 0
          last = top
          sheet.style.setProperty('--sy-sheet-top', `${top}px`)
          // Live rather than from `collapsed`, so a sheet being dragged up fills in as it
          // rises instead of when it lands.
          sheet.toggleAttribute(
            'data-sy-peek',
            (frameElement()?.clientHeight ?? window.innerHeight) - top < PEEK_PX + 8,
          )
        }
      }

      // Parks once the sheet has held still, and lets the events that can move it
      // wake the loop back up. Reading `getBoundingClientRect` forces a style/layout
      // flush, so an always-on loop would spend the map's frame budget on exactly the
      // most constrained devices — and the sheet stays stationary for almost all of a
      // session. Half a second of stillness is well past the end of any vaul spring.
      raf = still > IDLE_FRAMES ? 0 : requestAnimationFrame(tick)
    }

    // Only this widget's OWN events wake it. These listen on the host page's document,
    // because `resize` and a composed pointer event both arrive there. So an unfiltered
    // handler would restart the loop on any click anywhere on the embedding page, and on
    // any CSS transition it runs — which on a transition-heavy host would mean the loop
    // never parks at all. That would spend a third party's main-thread budget to solve a
    // problem that belongs to this widget alone. `wakesSheetLoop` owns that filter, and
    // why it reads the composed path rather than the target.
    const wake = (event?: Event) => {
      if (!wakesSheetLoop(event, sheet)) return

      still = 0
      raf ||= requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    // The three ways the top edge moves: a drag (no transition — vaul writes the
    // transform per pointer event), a snap animation, and a viewport resize.
    document.addEventListener('pointerdown', wake, true)
    window.addEventListener('resize', wake)
    document.addEventListener('transitionrun', wake, true)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', wake, true)
      window.removeEventListener('resize', wake)
      document.removeEventListener('transitionrun', wake, true)
    }
  }, [hasMap, direction])

  // Each view sets the sheet's height once, as it opens (`sheetOpens`, `openStop`): a class, its
  // share panel, a place's list and the filters as tall as their content, up to the near-full stop
  // (Anton, 6 Nov); the calendar, registration, online-only lists and results reached from the
  // filters near full; anything else at its open stop. A later measure never re-snaps, which would
  // drop a sheet the visitor dragged. Each class and each place opens anew, so the next one tapped
  // opens at its own height, not at the height the last one was left at.
  //
  // The map asks too (Map.tsx): a class's pin, or a cluster that won't split opening its list. The
  // request lands before the route changes, so it waits for the next history entry, not the path:
  // the pin or cluster of the page already on screen pushes the same path again.
  const mapOpens = useMapTap((s) => s.opens)
  const seenOpens = useRef(mapOpens)
  const openPending = useRef(false)

  useEffect(() => {
    if (mapOpens === seenOpens.current) return
    seenOpens.current = mapOpens
    openPending.current = true
  }, [mapOpens])

  const lastKind = useRef(top?.kind)
  const snappedFor = useRef<string | null>(null)

  useEffect(() => {
    const asked = openPending.current

    openPending.current = false
    const opening = sheetOpens(
      snappedFor.current,
      { direction, framed, kind: top?.kind, path: top?.path },
      asked,
    )

    if (opening === null) return
    snappedFor.current = opening

    const from = lastKind.current

    lastKind.current = top?.kind
    if (direction !== 'bottom') return
    const stop = openStop({
      asked,
      framed,
      from,
      kind: top?.kind,
      onlineOnly,
      searched: Boolean(searchCenter),
    })

    setSnap(
      { fit: FIT_SNAP, tall: WIDE_SNAP, search: SEARCH_SNAP, open: openSnap, full: fullSnap }[stop],
    )
  }, [location.key, direction, top?.kind, top?.path, framed, openSnap, onlineOnly])

  // The camera keeps a class's pin, or the place a list or the filters are about, clear of the sheet
  // that opened over it, since these open taller than the usual open stop. The filters open as tall
  // as their content (the near-full stop when unmeasured), so the place they are scoped to frames
  // in the strip above them, not behind them (the camera caps it to keep a strip).
  const setSheetBottom = useClassSheet((s) => s.setBottom)
  const filtersSheetPx =
    direction === 'bottom' && hasMap && top?.kind === 'filters' && !filterOverlay && !framed
      ? (fitPx ?? Math.round(window.innerHeight * NEAR_FULL_SHARE))
      : null

  // Collapsed to its peek, the sheet covers only the peek, so a frame taken then centres in the
  // map the visitor can see, not in its top half (#369).
  const collapsed = direction === 'bottom' && hasMap && snap === PEEK_SNAP

  useEffect(() => {
    // A class keeps its pin clear of the fitted sheet; a class too long to fit opens near full,
    // where the pin is hidden anyway, so it frames for the key-facts stop one drag below. Its
    // share panel keeps the same pin clear of its own fitted height, and a place's list keeps the
    // place clear of its own; a list too long to fit frames for the usual open stop below.
    const bottom = direction === 'bottom'

    setSheetBottom(
      collapsed
        ? PEEK_PX
        : bottom && top?.kind === 'event'
          ? (fitPx ?? eventOpenPx)
          : bottom && (top?.kind === 'share' || top?.kind === 'region')
            ? fitPx
            : filtersSheetPx,
    )

    return () => setSheetBottom(null)
  }, [direction, collapsed, top?.kind, eventOpenPx, fitPx, filtersSheetPx, setSheetBottom])

  // A new searched place lifts the sheet out of its peek, so results are never
  // fetched into a sheet the visitor cannot see. The effect above does not cover this
  // case: the geolocate control lives on the MAP, so "drag the sheet down to see the
  // map, then press locate" is the likely gesture — and it re-searches `/search`
  // without changing `top.kind`.
  //
  // `?center` moves only on a real re-search (never on a `?q` keystroke, never on a
  // filter edit), so this cannot fight a deliberate drag. Raising the sheet ONLY out
  // of the peek, rather than setting the snap outright, leaves a sheet the visitor
  // pulled tall exactly where they put it.
  //
  // A sheet raised only for typing (see `raise` below) has done its job once a place is picked, so
  // it comes back down to show the map.
  const raisedForTyping = useRef(false)

  useEffect(() => {
    if (direction !== 'bottom') return
    const lower = raisedForTyping.current

    raisedForTyping.current = false
    // A place that was just searched opens at the height that shows its groups, unless the visitor
    // already pulled the sheet taller (a sheet raised only for typing comes back down to it).
    if (searchCenter && top?.kind === 'search') {
      setSnap((current) => (current === WIDE_SNAP && !lower ? current : SEARCH_SNAP))
    } else {
      setSnap((current) => (current === PEEK_SNAP || lower ? openSnap : current))
    }
  }, [direction, searchCenter, openSnap])

  // Uniform for every view: dismissing pops to the parent, and the one view with no
  // parent (CountriesView) collapses to the peek instead of closing. Wired to both the
  // close/list buttons (via context) and vaul's swipe (onOpenChange).
  // The search view's query (center/bbox/q) is ambient context: keep it when popping
  // back into `/search` (for example, closing the filters drawer stacked over it), and
  // drop it when leaving search entirely. Only `/search` carries a query today.
  const toStackTarget = useCallback(
    (path: string) => (path === '/search' ? { pathname: path, search: location.search } : path),
    [location.search],
  )

  // History-aware dismiss (X / swipe / Esc): with in-widget history (depth > 0), go
  // chronologically back. That restores the prior camera, and returns to exactly
  // where the user came from (a `/search` result closes back to those results, not
  // the event's parent region). A fresh deep link (depth 0) has no in-widget entry to
  // pop, and `navigate(-1)` would navigate the *host page* away (the embedded widget
  // shares browser history). So it climbs to the structural parent instead. The root
  // view (no parent) collapses to its peek.
  const control = useMemo(() => {
    // Resolved ONCE, and read by both members below, so `canDismiss` can never drift
    // from what pressing X actually does. The error fallback renders its own header
    // (the view's own header is inside the boundary that caught the error) and must
    // not offer a close that no-ops: at the root there is nothing to climb to, and
    // `navigate(-1)` would take the HOST page back (issue #89).
    const action = dismissAction({ hasParent: Boolean(parentPath), depth })

    return {
      collapsed: snap === PEEK_SNAP,
      canCollapse,
      canDismiss: action !== 'collapse',
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? openSnap : PEEK_SNAP)),
      // Only the bottom sheet moves, and only on the way up: focus returning to a field in a sheet
      // already pulled tall changes nothing.
      raise: () => {
        if (direction !== 'bottom') return
        raisedForTyping.current = true
        setSnap(fullSnap)
      },
      setOpenHeight: setMeasuredOpenPx,
      // Bottom sheet only, like `raise`. The side panel has no snaps, and setting the near-full
      // one there would hide the settings cog, which hides at that snap.
      expand: () => {
        if (direction === 'bottom') setSnap(fullSnap)
      },
      dismiss: () => {
        // Marks the dismiss navigation as a transition: unmounting a heavy view (the
        // calendar's large grid) would otherwise reconcile synchronously and freeze
        // the click for a beat ("nothing happened"). As a transition, React keeps the
        // UI responsive and swaps the view when it is ready.
        // Filters apply as they're tapped, so going chronologically back would undo them.
        // Closing the drawer lands on the results instead, whichever way it was closed.
        const filterTarget =
          top?.kind === 'filters' ? filterCloseTarget(location.pathname, location.search) : null

        if (filterTarget) {
          startTransition(() => {
            navigate(filterTarget, { replace: true, state: location.state })
          })
        } else if (action === 'collapse') setSnap(PEEK_SNAP)
        else
          startTransition(() => {
            if (action === 'back') navigate(-1)
            // 'fallback': the same place the Back row names, passing over a place whose only class
            // is this page's (`climbDestination`). It says where it climbed from, so if the feed
            // isn't loaded such a place still climbs on by itself (RegionView, `climbedUpFrom`).
            else if (parentPath)
              navigate(
                toStackTarget(
                  climbDestination(
                    location.pathname,
                    climb.classes,
                    climb.venueSlugs,
                    climb.pathOf,
                  ),
                ),
                { state: { climbedFrom: location.pathname } },
              )
          })
      },
    }
  }, [
    snap,
    openSnap,
    canCollapse,
    parentPath,
    depth,
    location,
    navigate,
    toStackTarget,
    direction,
    top?.kind,
    fullSnap,
    climb,
  ])

  // The filter overlay's own dismiss (its X / swipe / Esc): back to the calendar it opened
  // over, with the query kept, because filters apply as they're tapped. A chronological back
  // would undo them.
  const overlayControl = useMemo(
    () => ({
      collapsed: false,
      canCollapse: false,
      // Always parented to the calendar, so its X always goes somewhere.
      canDismiss: true,
      toggle: () => {},
      raise: () => {},
      setOpenHeight: () => {},
      // The same back-vs-climb decision as `control` (via `dismissAction`), but the
      // overlay is always parented to the calendar (`hasParent: true` → never
      // 'collapse'), so 'fallback' climbs to `/calendar` directly, keeping its query.
      dismiss: () =>
        navigate(
          { pathname: '/calendar', search: location.search },
          { replace: true, state: location.state },
        ),
    }),
    [location, navigate],
  )

  // Whether the sheet advertises its drag affordance (issue #107). The atom's default is
  // `direction === 'bottom' && mode !== 'filled'`, which was right while `filled` (map-less)
  // could only ever be the wide left panel — "nothing to drag". Once the sheet is
  // container-aware, a narrow map-less embed becomes a `filled` BOTTOM sheet that IS
  // drag-dismissible. That default would then leave it dismissible with nothing on screen
  // saying so — an invisible affordance.
  //
  // This is keyed on dismissibility, rather than on the mode, so it can never claim one
  // that is not there. The map-less ROOT view sets `dismissible={false}`, since there is no
  // parent to climb to, and correctly keeps no handle. Map mode is always dismissible, so
  // this resolves to the atom's old answer there.
  // On desktop the floating panel hugs what's inside it, up to full height, so a short list
  // shows more map. Its width doesn't change, so the map's left padding stays correct.
  // The two variables sit on the portal target, which holds both the panel and its peek strips.
  // `--sy-panel-room` is in pixels because `--sy-frame-h` can be a percentage, and a percentage
  // inside the panel would resolve against the panel, whose height comes from this.
  const panelFits = hasMap && direction === 'left' && !wide
  const fitPanel = useCallback((height: number) => {
    overlayContainer()?.style.setProperty('--sy-panel-h', `${height + PANEL_BORDER_PX}px`)
  }, [])

  useEffect(() => {
    const target = overlayContainer()

    if (!panelFits || !target) return

    const measure = () => {
      const frameHeight = frameElement()?.clientHeight ?? window.innerHeight

      target.style.setProperty('--sy-panel-room', `${frameHeight - PANEL_MARGIN_PX}px`)
    }

    measure()
    window.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
      target.style.removeProperty('--sy-panel-room')
      target.style.removeProperty('--sy-panel-h')
    }
  }, [panelFits])

  const sheetDismissible = hasMap || parentPaths.length > 0
  // PROTOTYPE `?mapButton=float`: over the list-first view's list the pill always shows and opens
  // the map; on its map side, only at the full snap, where it folds the sheet down to the map.
  const mapPill = Boolean(pillPlacement) && (!hasMap || snap === fullSnap)
  const onMapPill = () => (hasMap ? setSnap(PEEK_SNAP) : surfaceSwitch?.toggle())

  const sheet = (
    <DrawerContent
      aria-label={t('countries.title')}
      handle={direction === 'bottom' && sheetDismissible}
      /**
       * The last rung of the Escape ladder, and the only place it can be built.
       *
       * A drawer is always the TOPMOST dismissable layer — vaul is a Radix dialog
       * underneath — and Radix delivers Escape to the topmost layer alone. So nothing
       * containing the widget can ever see the key. Inside a compact embed, the thing
       * containing it is the expanded surface, whose collapse control is otherwise the
       * only way out. If the host has hidden, confined, or scrolled that control away, a
       * visitor with no Escape is locked out of the page until they reload (issue #161).
       *
       * The ladder runs innermost-first. The stack dismisses while it has somewhere to
       * go. The sheet collapses to its peek while it can. Only then does the key belong
       * outward. `collapse()` is a no-op with no surface above this component — the
       * seam's whole point — so a normal embed reaches this line and nothing changes. At
       * that point vaul's own dismissal was already a no-op too. `dismissAction` returns
       * 'collapse', and the sheet is either already collapsed or has no snap points left
       * to collapse to.
       */
      onEscapeKeyDown={(event) => {
        // Rung zero: an open suggestion list inside the sheet (the add-a-class address search)
        // owns Escape. Closing the list must not also close the form and its draft. The path,
        // not the target: inside the embed's shadow root the target is the host element.
        if (event.composedPath().some(isOpenSuggestionList)) {
          event.preventDefault()

          return
        }
        if (control.canDismiss || (control.canCollapse && !control.collapsed)) return

        event.preventDefault()
        collapse()
      }}
    >
      {/* `view=list`: one control in one place, whichever surface is showing. Above the views,
          because a bottom sheet's foot sits below the screen at its lower snaps. */}
      {surfaceSwitch && MAP_BUTTON === 'row' && (
        <div className="mx-auto w-full max-w-[var(--sy-content-max,512px)] shrink-0 px-gutter">
          <button
            className="-ms-2 flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
            type="button"
            onClick={surfaceSwitch.toggle}
          >
            <MapIcon aria-hidden size={16} />
            {t(surfaceSwitch.surface === 'map' ? 'common.map.hide_map' : 'common.map.show_map')}
          </button>
        </div>
      )}
      <div
        ref={setSheetBody}
        aria-label={t('common.chrome.widget_label')}
        className="relative min-h-0 flex-1"
        role="region"
        style={mapPill ? PILL_ROOM : undefined}
      >
        {mapPill && hasMap && (
          // Pinned to the screen's foot, not the sheet's, the way the sticky footer is.
          <MapPill
            className="fixed bottom-[calc(var(--sy-sheet-top,0px)+16px)] left-1/2 -translate-x-1/2"
            onClick={onMapPill}
          />
        )}
        <AnimatePresence>
          {/* The filter drawer keeps one identity across its routes. Picking a place moves it
              from `/filters` to `/search/filters`, and that must not crossfade the form. */}
          <ViewLayer
            key={top?.kind === 'filters' ? 'filters' : (top?.path ?? '/')}
            onHeight={panelFits ? fitPanel : undefined}
          >
            {/* Suspense sits OUTSIDE the boundary, so a lazy view's chunk load is a
                suspend that shows `DrawerLoading` — the shared chrome (header plus close
                control, rebuilt from the URL) over a spinner — and only a FAILED load
                throws inward to the boundary. That is what keeps a first open of the
                calendar, register, or share drawer from flashing blank or unstyled: the
                drawer's identity is on screen from the first frame, and only its body
                arrives late (issue #96). */}
            <Suspense fallback={<DrawerLoading />}>
              <ResetErrorBoundary
                FallbackComponent={DrawerErrorFallback}
                onReset={() => setSecondary(loadSecondaryViews())}
              >
                <ClientGate />
                <TopView entry={top} parentPath={parentPath ?? '/'} secondary={secondary} />
              </ResetErrorBoundary>
            </Suspense>
          </ViewLayer>
        </AnimatePresence>
      </div>
    </DrawerContent>
  )

  // The filter overlay drawer (map mode only): a modal panel over the mounted
  // calendar — right at ≥md, a bottom sheet on mobile — with its own control.
  // FilterView's Show button goes through the same dismiss, which closes it.
  const filterDrawer = filterOverlay ? (
    <DrawerControlContext.Provider value={overlayControl}>
      <Drawer
        key="filter-overlay"
        dismissible
        modal
        open
        direction={isWide ? 'right' : 'bottom'}
        handleOnly={isWide}
        onOpenChange={(o) => !o && overlayControl.dismiss()}
      >
        <DrawerContent aria-label={t('filters.chrome.title')}>
          {/* The one drawer in the app with no fence of its own — a throw here used to
              escape to the app-level boundary and blank the whole widget on the host
              page. This stays safe today only because FilterView reads exclusively
              through non-suspense `useQuery`. Nothing structural keeps it that way
              (issue #89). */}
          <Suspense fallback={<DrawerLoading />}>
            <ResetErrorBoundary FallbackComponent={DrawerErrorFallback}>
              <FilterView />
            </ResetErrorBoundary>
          </Suspense>
        </DrawerContent>
      </Drawer>
    </DrawerControlContext.Provider>
  ) : null

  // The docked flow closes back onto the page behind it: chronologically back when it was opened
  // here, or up to that page for a fresh link to the flow.
  const submitControl = useMemo(
    () => ({
      ...overlayControl,
      dismiss: () => {
        if (depth > 0) navigate(-1)
        else navigate(parentOf(location.pathname) ?? '/', { replace: true, state: location.state })
      },
    }),
    [overlayControl, depth, location, navigate],
  )
  const submitPanel =
    submitOverlay && isSubmitEntry(submitEntry) ? (
      <DrawerControlContext.Provider value={submitControl}>
        <Drawer
          key="submit-panel"
          handleOnly
          open
          container={overlayContainer()}
          direction="right"
          dismissible={false}
          measureAgainst={frameElement()}
        >
          <DrawerContent
            aria-label={t(submitTitleKey(submitEntry.kind))}
            className={SUBMIT_PANEL}
            handle={false}
          >
            <Suspense fallback={<DrawerLoading />}>
              <ResetErrorBoundary
                FallbackComponent={DrawerErrorFallback}
                onReset={() => setSecondary(loadSecondaryViews())}
              >
                <secondary.SubmitView entry={submitEntry} />
              </ResetErrorBoundary>
            </Suspense>
          </DrawerContent>
        </Drawer>
      </DrawerControlContext.Provider>
    ) : null

  // Map-less: one contained drawer fills the widget container (there is no map to
  // reveal, so no snap ladder). Standalone owns the viewport
  // (100dvh). Embedded fills the host's slot (100%).
  if (!hasMap) {
    return (
      <WidgetWidthContext.Provider value={isWide}>
        <DrawerControlContext.Provider value={control}>
          {/* ⚠ Clip, never hidden — `components/AGENTS.md` carries why (#326). Nothing was
              measured overflowing here, since the sheet takes no snap ladder map-less — the
              invariant stated, not a defect repaired. */}
          <div
            className="flex w-full flex-col overflow-clip bg-background"
            style={{ height: standalone ? '100dvh' : '100%' }}
          >
            <div
              ref={setContainer}
              className="relative min-h-0 w-full flex-1 overflow-clip"
              style={mapPill ? PILL_ROOM : undefined}
            >
              {mapPill && (
                <MapPill
                  className="absolute bottom-4 left-1/2 -translate-x-1/2"
                  onClick={onMapPill}
                />
              )}
              <Drawer
                key={direction}
                open
                container={container}
                direction={direction}
                dismissible={parentPaths.length > 0}
                // Same as the map drawer: the left panel (≥md) has no handle, so
                // handle-only drag would make it undraggable — dismiss stays the close
                // button only.
                handleOnly={direction === 'left'}
                mode="filled"
                onOpenChange={(o) => !o && control.dismiss()}
              >
                {sheet}
              </Drawer>
            </div>
            {/* Its own strip below the views, not floating over them: floating, the cog sat on
                form fields and list rows, and the narrower the box the more it covered. */}
            <div className="flex h-11 shrink-0 items-center border-t border-divider px-gutter">
              <SettingsMenu side="top" />
            </div>
          </div>
        </DrawerControlContext.Provider>
      </WidgetWidthContext.Provider>
    )
  }

  // Map mode: the settings cog (portaled beside the drawer) plus the single drawer.
  const target = overlayContainer()

  // The floating "Add a class" button, beside the side panel only — `isWide`, the same answer that
  // picked the panel, so a narrow embed or a phone (the bottom sheet covers the bottom edge) never
  // gets it. Hidden where the flow is already open, and where a panel covers the map's bottom
  // right: the full-width calendar, and the filter overlay over the calendar. It opens over the
  // place on screen, or at the root where no one place shows.
  const place = placeInStack(baseEntries)
  const placeName = place && regions?.find((node) => node.slug === place.slug)?.name
  const showAddClass = isWide && !wide && !filterOverlay && !submitOverlay && !isSubmitEntry(top)

  return (
    <WidgetWidthContext.Provider value={isWide}>
      <FilterPanelAvailableContext.Provider value={filterPanelAvailable}>
        <DrawerControlContext.Provider value={control}>
          {target &&
            createPortal(
              <>
                <div
                  ref={sheetOriginRef}
                  aria-hidden
                  className="pointer-events-none fixed top-0 h-0 w-0"
                />
                {tallSheet && <div aria-hidden className="fixed inset-0 z-[35] bg-black/50" />}
                {/* The docked add-a-class panel takes that side of the map while it is open. */}
                {filterPanelAvailable === 'panel' && filterPanelOpen && !submitOverlay && (
                  <FiltersPanel />
                )}
                {filterPanelAvailable === 'chips' && <FilterChipBar />}
                {/* The top of the map's one control column, with locate and attribution below it
                  (`.mapboxgl-ctrl-top-right` in globals.css holds the shared size and margins).
                  That corner is free in both layouts, and nothing here depends on the panel's
                  width any more. It is physical `right`, paired with Mapbox's own corner: the
                  drawer's RTL flip is still deferred (`atoms/Drawer`). Hidden on the full-width
                  calendar, and at the sheet's near-full snap (which also covers the tall
                  filters sheet), which covers the column anyway. */}
                {!wide && snap !== WIDE_SNAP && (
                  // With the filter panel up, the cog moves in beside it with the rest of the
                  // column, by the same `--sy-map-end` Map.tsx sets on the map.
                  <div className="contents" style={filterPanelUp ? COG_BESIDE_PANEL : undefined}>
                    <SettingsMenu
                      align="end"
                      className="fixed top-[var(--sy-map-ctrl-top)] right-[calc(var(--sy-map-ctrl-end)+var(--sy-map-end,0px))] z-20"
                    />
                  </div>
                )}
                {showAddClass && (
                  <AddClassButton
                    accessibleName={
                      placeName
                        ? t('submit.chrome.add_row_in', { place: placeName })
                        : t('submit.chrome.add_row')
                    }
                    href={addClassPath(place?.path)}
                    label={t('submit.chrome.title_add')}
                  />
                )}
              </>,
              target,
            )}
          <Drawer
            key={direction}
            dismissible
            open
            activeSnapPoint={direction === 'bottom' ? shownSnap : undefined}
            container={target}
            direction={direction}
            // The left panel (≥md) has no handle and no snap points, so restricting
            // drag to the (absent) handle makes it undraggable — dismiss stays the
            // close button only. The mobile bottom sheet keeps its full-panel
            // snap-drag.
            handleOnly={direction === 'left'}
            // The box vaul measures snap points against — the frame, or the window.
            // Deliberately NOT `target`: that is the portal target, which embedded is
            // the `display: contents` theme root and measures 0×0. See the note in
            // `Drawer.tsx`.
            measureAgainst={frameElement()}
            setActiveSnapPoint={direction === 'bottom' ? setShownSnap : undefined}
            snapPoints={direction === 'bottom' ? shownSnapPoints : undefined}
            wide={wide}
            onOpenChange={(o) => !o && control.dismiss()}
          >
            {sheet}
          </Drawer>
          {filterDrawer}
          {submitPanel}
        </DrawerControlContext.Provider>
      </FilterPanelAvailableContext.Provider>
    </WidgetWidthContext.Provider>
  )
}
