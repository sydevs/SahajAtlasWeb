import type { Geojson, RegionNode } from '@/types'

import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'

import { geojsonQuery, regionsQuery } from '@/config/api'
import { useExpansion } from '@/hooks/use-expansion'
import { useLocale } from '@/hooks/use-locale'
import { Drawer, DrawerContent } from '@/components/atoms/Drawer'
import { ResetErrorBoundary, SettingsMenu } from '@/components/molecules'
import { ClientGate } from '@/config/client-gate'
import {
  MIN_MAP_STRIP_PX,
  SHEET_OPEN_PX,
  SHEET_PEEK_PX,
  WIDE_SNAP,
  WidgetWidthContext,
  capStop,
  shortSheetCap,
  useIsShortViewport,
  useIsWide,
} from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import {
  useBrowsedCountry,
  useCalendarPosition,
  useMapControls,
  useSheetCover,
} from '@/config/store'
import { frameElement, overlayContainer } from '@/lib/overlay'
import {
  type StackEntry,
  CALENDAR_VIEW_LIST,
  backStep,
  sameRoute,
  baseStackEntry,
  isFilterOverlay,
  isOnline,
  isoCountryCode,
  passablePlaces,
  placePathsOf,
  resolveStack,
  viewLayerKey,
} from '@/lib/shape'
import { wakesSheetLoop } from '@/views/DrawerStack/sheet-wake'
import { ViewLayer } from '@/views/DrawerStack/ViewLayer'
import {
  capPoints,
  FIT_SNAP,
  heldFoldPx,
  HOME_SNAP,
  OPEN_SNAP,
  PEEK_SNAP,
  resolveStop,
  sheetLadder,
  sheetOpening,
} from '@/views/DrawerStack/sheet-ladder'
import { useFitSnap } from '@/views/DrawerStack/use-fit-snap'
import { DrawerControlContext, NO_DRAWER_CONTROL } from '@/views/shared'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { SearchView } from '@/views/SearchView/SearchView'
import { FilterView } from '@/views/FilterView/FilterView'
import { RegionView } from '@/views/RegionView/RegionView'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { EventView } from '@/views/EventView/EventView'

// The two views most visitors never open, split out of the eager graph (issue #96). Each
// one is the only consumer of a large dependency the widget would otherwise pay for at first
// paint on every host page. The calendar owns the whole Schedule-X stack — its grid, its
// views, its theme CSS. Registration owns react-hook-form plus the resolver.
//
// These are the RIGHT two to split, because neither can be the first thing on screen
// by accident. Each is reached by pressing something — the calendar button, an event's
// Register action — or by a deep link that is already a deliberate act. The views
// that CAN be the entry point — the country index, a region, search, an event — stay eager,
// so the common path still resolves inside the graph the host already fetched.
//
// These are minted per attempt, not once at module scope, for the reason spelled out in
// `EventView.tsx`. React caches a lazy component's REJECTED payload forever. A module-scope
// `lazy` would leave the drawer boundary's "Try again" re-throwing the stored rejection
// instantly — the visibly-does-nothing button that issue #89 removed. The two are minted
// together, because one reset serves one boundary. A fresh `lazy` for a view that did not
// fail costs nothing, since the object stays inert until rendered, and only one of them is
// ever mounted at a time.
const loadSecondaryViews = () => ({
  CalendarView: lazy(() =>
    import('@/views/CalendarView/CalendarView').then((m) => ({ default: m.CalendarView })),
  ),
  RegistrationView: lazy(() =>
    import('@/views/RegistrationView/RegistrationView').then((m) => ({
      default: m.RegistrationView,
    })),
  ),
})

type SecondaryViews = ReturnType<typeof loadSecondaryViews>

// Frames a stationary sheet holds before the `--sy-sheet-top` mirror parks itself (about
// 0.5s at 60fps — well past the end of any vaul spring). See the effect below for why it
// parks at all.
const IDLE_FRAMES = 30

type Direction = 'left' | 'bottom'

// Dispatches the active (top) view's inner content. Only the top view renders, so each view
// frames the map for its own level on mount.
//
// The lazy views arrive as a prop, rather than being read from module scope, so
// the identity a boundary reset replaces is the one this renders — see `loadSecondaryViews`.
function TopView({ entry, secondary }: { entry: StackEntry | null; secondary: SecondaryViews }) {
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
      return <secondary.RegistrationView eventPath={entry.eventPath} />
  }
}

// The whole drawer navigation, derived purely from the pathname. ONE persistent vaul
// drawer holds the active (top) view. The sheet renders once — DrawerStack owns the
// DrawerContent, and views are just its inner content. So navigating never remounts or
// re-slides the drawer. The inner content cross-fades instead. Every view is handled the same
// way: Back goes where it says (`backStep`), and the one view with no parent
// (CountriesView) collapses to its peek instead. Nothing draws the history behind the view:
// Back names it. Direction is left at ≥md, bottom on mobile. Map-less, the single drawer fills
// the widget container.
export function DrawerStack() {
  const location = useLocation()
  // Reads off the location rather than through `useSearchParams`, which would add a
  // second subscription for a value this component already re-renders on.
  const searchCenter = new URLSearchParams(location.search).get('center')
  const navigate = useNavigate()
  const { hasMap, standalone } = useWidgetMode()
  // `t` comes off `useLocale`, not a second `useTranslation` call: the hook already
  // holds one for the default (`common`) namespace, and hands it back for exactly this
  // reason. A second call would double this component's i18next subscription, and
  // DrawerStack re-renders on every navigation.
  const { t } = useLocale()
  // Read unconditionally, like every other seam consumer: with no surface above this
  // component, it is the no-op provider, and the Escape ladder below simply ends where
  // it always did.
  const { collapse } = useExpansion()
  const queryClient = useQueryClient()
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
  const direction: Direction = isWide ? 'left' : 'bottom'
  const [snap, setSnap] = useState<number | string | null>(OPEN_SNAP)
  // Set by "Show N classes": the results it closes onto open at the near-full stop.
  const resultsTall = useRef(false)
  // Where a step back is due to land, and the entry it left (`dismiss`).
  const landing = useRef<{ key: string; to: string } | null>(null)
  // Whether the sheet is sitting at its peek, measured by the sheet-top loop below. Never true
  // where the sheet cannot collapse, since the loop does not run there.
  const [atPeek, setAtPeek] = useState(false)
  // Whether the sheet leaves less than `MIN_MAP_STRIP_PX` of map above it, from the same loop.
  const [sheetTall, setSheetTall] = useState(false)
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
  const filterOverlay = isFilterOverlay(entries, hasMap)

  // Reads through `baseStackEntry` rather than the last non-overlay entry — the same value
  // either way, but stated in the shared vocabulary, so `top.path` is provably
  // `topViewKey(location.pathname, hasMap)`. `useFrameOnTop` compares itself against
  // that key to tell whether it is still the view on top, and the two agreeing is what
  // makes the comparison mean anything.
  const top = baseStackEntry(entries, hasMap) ?? null
  // The calendar is the one full-width view. It fills the widget, minus the floating margins,
  // instead of the 352px left panel (see the Drawer `wide` variant) — EXCEPT in its list
  // (agenda) view, one narrow column that reads better at the regular width. `isWide` is here
  // because the wide panel exists only above the crossing (#331). The view is read reactively, so
  // switching it resizes the drawer. Date changes do not re-render this component.
  const calendarView = useCalendarPosition((s) => s.view)
  const wide = top?.kind === 'calendar' && isWide && calendarView !== CALENDAR_VIEW_LIST
  // What Back does, worked out once for its label and its press. A fresh deep link's climb follows
  // the region tree, not the words typed: `/united-kingdom/south-east/london` shows London, and
  // Back must lead to the UK at `/gb`, not a `/united-kingdom` that doesn't exist. It also passes
  // over venues and one-class places. The caches are read, never observed: this component stays
  // mounted all session, and an observer would keep the wholesale caches from ever being
  // collected. `cachesFilled` re-reads them when either arrives, since a deep link renders this
  // before they do.
  const cachesFilled = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
      [queryClient],
    ),
    () =>
      `${queryClient.getQueryState(regionsQuery().queryKey)?.dataUpdatedAt}:${
        queryClient.getQueryState(geojsonQuery().queryKey)?.dataUpdatedAt
      }`,
  )
  // The places a climb passes over walk every class in the feed, and the place paths build a Map
  // of the whole region tree, so both are worked out per feed rather than per navigation.
  const climb = useMemo(() => {
    const regions = queryClient.getQueryData<RegionNode[]>(regionsQuery().queryKey)
    const feed = queryClient.getQueryData<Geojson>(geojsonQuery().queryKey)

    return {
      pathOf: placePathsOf(regions),
      passable:
        regions && feed
          ? passablePlaces(
              regions,
              feed.features.map(({ properties }) => ({
                region: properties.region,
                online: isOnline(properties),
              })),
            )
          : undefined,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cachesFilled` is the re-read trigger for caches nothing here observes
  }, [queryClient, cachesFilled])
  const step = useMemo(() => backStep(location, climb), [location, climb])
  // The country on screen, kept through the routes that name none (search, calendar), so the
  // place search a country page opens stays in that country. The world view clears it.
  const setBrowsedCountry = useBrowsedCountry((s) => s.setCode)

  useEffect(() => {
    const first = location.pathname.split('/')[1]
    const code = isoCountryCode(first)

    if (!first || code) setBrowsedCountry(code)
  }, [location.pathname, setBrowsedCountry])

  const canCollapse = hasMap && direction === 'bottom'

  // How tall the top view opens on a phone (`sheetOpening` says why each one does).
  const opening = sheetOpening(top?.kind)
  const classView = top?.kind === 'event'
  const fitsContent = opening === 'fit'
  // Keys the open stop per class, so class B tapped after class A opens at B's own fit.
  const openedClass = classView ? location.pathname : null
  const { fit, fold: measuredFold } = useFitSnap(canCollapse && fitsContent, location.pathname)
  const fold = classView ? (heldFoldPx(snap) ?? measuredFold) : null
  const home = opening === 'home'
  const ladder = useMemo(
    () => sheetLadder({ classView, fit, fold, home }),
    [classView, fit, fold, home],
  )
  const { points: snapPoints, fitSnap } = ladder
  const openSnap = fitsContent ? FIT_SNAP : home ? HOME_SNAP : OPEN_SNAP
  const vaulSnap = resolveStop(ladder, snap)
  // vaul echoes every `activeSnapPoint` it is handed back through this setter. Taking the echo
  // literally would swap the token for whatever it resolved to that render, and the sheet would
  // stop following its content.
  const setVaulSnap = (next: number | string | null) => {
    if (next === vaulSnap) return
    setSnap(fitSnap !== null && next === fitSnap ? FIT_SNAP : next)
  }
  // A short window caps the pixel stops (`shortSheetCap`) only on the way to vaul, so
  // `snap` keeps naming the logical stop and everything that compares it stays as it is. The
  // near-full stop is a fraction, and still covers the map on purpose.
  const shortViewport = useIsShortViewport()
  const snapCap = shortViewport && canCollapse && !frameElement() ? shortSheetCap() : null
  // Memoised like the ladder it is built from: vaul re-measures every stop when this changes.
  const shownSnapPoints = useMemo(() => capPoints(snapPoints, snapCap), [snapPoints, snapCap])
  const shownSnap = capStop(vaulSnap, snapCap)
  const setShownSnap = (next: number | string | null) => {
    // A capped stop stands for every stop above the cap: the sheet stays where it was if that caps
    // to here, and otherwise opens at its usual open stop.
    if (snapCap !== null && next === `${snapCap}px` && !snapPoints.includes(next)) {
      if (shownSnap !== next) setSnap(openSnap)

      return
    }
    setVaulSnap(next)
  }
  // What the sheet covers of the map, resolved from the snap it sits at, so the camera reserves
  // the collapsed peek while the sheet is collapsed and a class's taller sheet while it is open.
  // The near-full stop hides the class's pin whatever the camera does, so there the camera frames
  // for the key-facts stop, or the shared open stop.
  const coverPx = typeof vaulSnap === 'string' ? parseFloat(vaulSnap) : (fold ?? SHEET_OPEN_PX)
  const sheetCover = !canCollapse ? null : Math.min(coverPx, snapCap ?? Infinity)
  const setSheetCover = useSheetCover((s) => s.setBottom)

  useEffect(() => {
    setSheetCover(sheetCover)

    return () => setSheetCover(null)
  }, [sheetCover, setSheetCover])

  // The sheet's near-full stop covers the map's control column all but its top edge, which would
  // show as a row of slivers above the sheet. Everywhere else a drawer either leaves the column
  // clear or covers it whole.
  // Any sheet that tall cuts through the column, so it goes; the filters, a form over the page, also
  // dim what is left of the map above them.
  const dimmed = canCollapse && sheetTall && top?.kind === 'filters'
  const controlsHidden = canCollapse && sheetTall
  const setControlsHidden = useMapControls((s) => s.setHidden)

  useEffect(() => {
    setControlsHidden(controlsHidden)

    return () => setControlsHidden(false)
  }, [controlsHidden, setControlsHidden])

  // Mirrors the active sheet's live top onto the sheet itself, every frame, so what reads it
  // tracks a drag without waiting for the snap to settle (map plus mobile only). It is what
  // pins EventView's sticky register bar to the viewport edge — inside the transformed sheet,
  // `position: fixed` resolves against the sheet, so the bar offsets by the live top instead
  // (issue #52, WS4) — and what tells ViewLayer the sheet is at its peek.
  //
  // CSS anchor positioning cannot retire this loop, so no `build.target` raise does
  // either. `anchor()` is valid only in inset properties, and `Fallbacks`'
  // `CENTERED_BODY` reads this variable in `max-height`, so that consumer keeps the
  // loop running however high the floor goes.
  useEffect(() => {
    // This effect runs for every bottom-sheet view, root included. The sticky register bar only
    // exists above the root, but `--sy-sheet-top` has other consumers.
    // The error and loading bodies centre themselves within the VISIBLE sheet, and the root
    // can fail too, on a cold `['countries']` read. Without the variable there, they would
    // centre inside a body that is `h-dvh` tall while only its top 356px is on screen — below
    // the fold, which is the same bug that made both states invisible on mobile in the first
    // place (issue #89).
    if (!canCollapse) return
    let raf = 0
    let still = 0
    let last = Number.NaN
    // This looks the sheet up lazily — it mounts with this effect — and caches it, so there
    // is no need to re-query the DOM every frame. `isConnected` is what makes caching safe
    // now that the effect no longer re-runs per depth change. Two elements carry
    // `[data-vaul-drawer]`, the main sheet and the filter overlay, so a resize across the md
    // breakpoint can leave this holding the overlay. Once that overlay closes, a detached
    // node measures `top: 0`, and the live sheet would stop being tracked.
    //
    // ⚠ **Scoped to this widget's own portal target, not `document`.** Both drawers portal
    // through `overlayContainer()` — the frame, or the theme root — never `document.body`,
    // whatever an older comment here claimed. A document-wide query reaches the HOST's DOM,
    // and vaul is a common shadcn dependency. A drawer of theirs, earlier in document order,
    // would win. This code would then write an inline `--sy-sheet-top` onto a host node
    // every frame.
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
        // consumed as `bottom:` on the sticky Register bar, which a frame contains
        // (`contain: layout`). Left raw, it sat 16-32px out inside the expanded dialog, by
        // exactly its margin.
        // Contained on a host's page (#169), the error becomes however far down their
        // page the element sits, which is unbounded. With no frame, the offset is zero,
        // so this stays the same number it always was.
        // This reads from the node the overlay module already tracks, NOT
        // `document.querySelector('[data-sy-frame]')`. That would search the host's
        // whole document, so an element of theirs carrying the attribute would win on
        // document order and offset the bar by its box. Its RECT is still read per
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
        let box = 0

        try {
          // ⚠ Read against a `fixed` origin on the same layer, not against the viewport. While
          // the iOS keyboard is up, Safari pans the page, and a rect read alone shifts by that
          // pan. The loop then parks on the panned value, because the pan ending fires nothing
          // that wakes it, and the Register bar stays stranded mid-screen. Both rects shift
          // together, so the difference holds through a pan, and the origin lands on a frame's
          // edge where one contains the layer.
          const origin =
            sheetOriginRef.current?.getBoundingClientRect().top ??
            frameElement()?.getBoundingClientRect().top ??
            0

          top = sheet.getBoundingClientRect().top - origin
          // Read with the rects, before the writes below dirty the style.
          box = frameElement()?.clientHeight ?? window.innerHeight
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
          // One answer for the peek, from the live top rather than from the settled snap, so a
          // sheet dragged up fills in as it rises instead of when it lands. ViewLayer hides what
          // the peek cannot show off the attribute; the header's controls read `collapsed`, which
          // is this same boolean — decided twice, they disagreed for the length of a drag and the
          // row offered a view's actions over an invisible body. The state setter bails out on an
          // unchanged value, so this re-renders once per crossing, not once per frame.
          const atPeekNow = box - top < SHEET_PEEK_PX + 8

          sheet.toggleAttribute('data-sy-peek', atPeekNow)
          setAtPeek(atPeekNow)
          setSheetTall(top < MIN_MAP_STRIP_PX)
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
  }, [canCollapse])

  // Each view opens at its own height (`sheetOpening`). Keyed on the view KIND (not `wide`), so
  // switching the calendar between month/week/list keeps it tall. This runs only when the top
  // view changes, so it never fights a manual drag within one.
  useEffect(() => {
    if (direction !== 'bottom') return

    const landTall = resultsTall.current

    resultsTall.current = false
    setSnap(opening === 'tall' || landTall ? WIDE_SNAP : openSnap)
  }, [direction, opening, openSnap, top?.kind, openedClass])

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
  useEffect(() => {
    if (direction === 'bottom') setSnap((current) => (current === PEEK_SNAP ? OPEN_SNAP : current))
  }, [direction, searchCenter])

  // Back, swipe and Esc all run `dismiss`, and Back's label reads the same `step`, so what it
  // says is where it goes. With in-widget history it goes chronologically back, restoring the
  // prior camera. Otherwise it climbs: `navigate(-1)` there would take the HOST page back (the
  // embedded widget shares browser history). The root view collapses to its peek. Closing the
  // filters replaces their own entry instead, or steps back onto the view they covered.
  const dismiss = useCallback(() => {
    if (!step) return setSnap(PEEK_SNAP)
    // A transition: unmounting a heavy view (the calendar's large grid) would otherwise
    // reconcile synchronously and freeze the click for a beat ("nothing happened").
    startTransition(() => {
      if (step.how === 'history') {
        landing.current = { key: location.key, to: step.to }
        navigate(-1)
      } else if (step.how === 'replace') navigate(step.to, { replace: true, state: location.state })
      // A climb says where it climbed from, so a place that opens its lone class climbs on
      // rather than bouncing back into it (RegionView, `loneClassExit`).
      else navigate(step.to, { state: { climbedFrom: location.pathname } })
    })
  }, [step, navigate, location.key, location.pathname, location.state])

  // A step back lands where it said: closing the filters onto the search they covered keeps the
  // answers tapped since, by rewriting the landed entry's query rather than restoring the old one.
  useLayoutEffect(() => {
    const pending = landing.current

    if (!pending || pending.key === location.key) return
    landing.current = null
    if (
      location.pathname === pending.to.split('?')[0] &&
      !sameRoute(`${location.pathname}${location.search}`, pending.to)
    ) {
      navigate(pending.to, { replace: true, state: location.state })
    }
  }, [location, navigate])

  // "Show N classes" closes the filters like the X does, then opens the results tall.
  const showResults = useCallback(() => {
    resultsTall.current = canCollapse
    dismiss()
  }, [canCollapse, dismiss])

  const control = useMemo(
    () => ({
      // The filter overlay's X is the way out while it covers the calendar.
      backTo: filterOverlay ? undefined : step?.to,
      collapsed: canCollapse && atPeek,
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? openSnap : PEEK_SNAP)),
      dismiss,
      showResults,
    }),
    [filterOverlay, step, atPeek, openSnap, canCollapse, dismiss, showResults],
  )

  // The filter overlay's own control: its X, swipe and Esc close it the same way, through the
  // same `step`.
  const overlayControl = useMemo(
    () => ({ ...NO_DRAWER_CONTROL, overlay: true, dismiss, showResults: dismiss }),
    [dismiss],
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
  const sheetDismissible = hasMap || step !== undefined
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
       * that point vaul's own dismissal was already a no-op too: there is no Back step, and
       * the sheet is either already collapsed or has no snap points left to collapse to.
       */
      onEscapeKeyDown={(event) => {
        if (step || (canCollapse && snap !== PEEK_SNAP)) return

        event.preventDefault()
        collapse()
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1">
        {/* `initial={false}`: the first view takes over from the loading shapes already on
            screen, so it arrives without fading in from nothing. Later views still cross-fade. */}
        <AnimatePresence initial={false}>
          <ViewLayer key={viewLayerKey(top)}>
            {/* Suspense sits OUTSIDE the boundary, so a lazy view's chunk load is a
                suspend that shows `DrawerLoading` — the shared chrome (header plus Back,
                rebuilt from the URL) over placeholders shaped like the view — and only a FAILED load
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
                <TopView entry={top} secondary={secondary} />
              </ResetErrorBoundary>
            </Suspense>
          </ViewLayer>
        </AnimatePresence>
      </div>
    </DrawerContent>
  )

  // The filter overlay drawer (map mode only): a modal panel over the mounted
  // calendar — right at ≥md, a bottom sheet on mobile — with its own control.
  // FilterView's Apply and Clear actions navigate to /calendar too, which closes it.
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
            <div ref={setContainer} className="relative min-h-0 w-full flex-1 overflow-clip">
              <Drawer
                key={direction}
                enterInPlace
                open
                container={container}
                direction={direction}
                dismissible={step !== undefined}
                // Same as the map drawer: the left panel (≥md) has no handle, so
                // handle-only drag would make it undraggable — dismiss stays Back only.
                handleOnly={direction === 'left'}
                mode="filled"
                onOpenChange={(o) => !o && control.dismiss()}
              >
                {sheet}
              </Drawer>
            </div>
            {/* Map-less, the drawer fills its box and its header owns the top, so the cog
                gets its own strip below the views. Floating over them, it sat on list rows and
                form fields, and the narrower the box the more it covered. side="top" opens
                the menu upward from there. */}
            <div className="flex h-12 shrink-0 items-center border-t border-divider px-gutter">
              {/* ⚠ The negative start margin pulls the control back so its 20px GLYPH, not its
                  box, sits on the strip's gutter — lining the cog up with the drawer content
                  above it. The box is 32px on a fine pointer and 44px on a coarse one, so the
                  pull is half of each difference. */}
              <SettingsMenu className="-ms-1.5 pointer-coarse:-ms-3" side="top" variant="ghost" />
            </div>
          </div>
        </DrawerControlContext.Provider>
      </WidgetWidthContext.Provider>
    )
  }

  // Map mode: the single drawer, plus the sheet's measuring origin, portaled beside it.
  const target = overlayContainer()

  return (
    <WidgetWidthContext.Provider value={isWide}>
      <DrawerControlContext.Provider value={control}>
        {target &&
          createPortal(
            <>
              <div
                ref={sheetOriginRef}
                aria-hidden
                className="pointer-events-none fixed top-0 h-0 w-0"
              />
              {dimmed && <div aria-hidden className="fixed inset-0 z-30 bg-black/50" />}
            </>,
            target,
          )}
        <Drawer
          key={direction}
          dismissible
          enterInPlace
          open
          activeSnapPoint={direction === 'bottom' ? shownSnap : undefined}
          container={target}
          direction={direction}
          // The left panel (≥md) has no handle and no snap points, so restricting
          // drag to the (absent) handle makes it undraggable — dismiss stays Back
          // only. The mobile bottom sheet keeps its full-panel snap-drag.
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
      </DrawerControlContext.Provider>
    </WidgetWidthContext.Provider>
  )
}
