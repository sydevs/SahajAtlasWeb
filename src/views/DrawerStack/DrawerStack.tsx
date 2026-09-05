import type { RegionNode } from '@/types'

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
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'

import { eventTitlesQuery, regionsQuery } from '@/config/api'
import { useExpansion } from '@/hooks/use-expansion'
import { useLocale } from '@/hooks/use-locale'
import { Drawer, DrawerContent } from '@/components/atoms/Drawer'
import { ResetErrorBoundary, SettingsMenu } from '@/components/molecules'
import { WidgetWidthContext, useIsWide } from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import { useCalendarPosition } from '@/config/store'
import { frameElement, overlayContainer } from '@/lib/overlay'
import {
  type StackEntry,
  atlasDepth,
  dismissAction,
  dismissDepth,
  baseStackEntry,
  isFilterOverlay,
  resolveStack,
} from '@/lib/shape'
import { stripLabel } from '@/views/DrawerStack/strip-label'
import { DrawerControlContext } from '@/views/shared'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { SearchView } from '@/views/SearchView/SearchView'
import { FilterView } from '@/views/FilterView/FilterView'
import { RegionView } from '@/views/RegionView/RegionView'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { EventView } from '@/views/EventView/EventView'

// The three views most visitors never open, split out of the eager graph (issue #96).
// Each one is the only consumer of a large dependency the widget would otherwise pay for
// at first paint on every host page: the calendar owns the whole Schedule-X stack (its
// grid, its views, its theme CSS), registration owns react-hook-form plus the resolver,
// and share owns react-share's target composers.
//
// These are the RIGHT three to split, because none of them can be the first thing on
// screen by accident. Each is reached by pressing something (the calendar button, an
// event's Register or Share action), or by a deep link that is already a deliberate act.
// The views that CAN be the entry point — the country index, a region, search, an event —
// stay eager, so the common path still resolves inside the graph the host already fetched.
//
// These are minted per attempt, not once at module scope, for the reason spelled out in
// `EventView.tsx`: React caches a lazy component's REJECTED payload forever. A
// module-scope `lazy` would leave the drawer boundary's "Try again" re-throwing the
// stored rejection instantly — the visibly-does-nothing button that issue #89 removed.
// The three are minted together because one reset serves one boundary. A fresh `lazy`
// for a view that did not fail costs nothing (the object stays inert until rendered), and
// only one of them is ever mounted at a time.
const loadSecondaryViews = () => ({
  CalendarView: lazy(() =>
    import('@/views/CalendarView/CalendarView').then((m) => ({ default: m.CalendarView })),
  ),
  RegistrationView: lazy(() =>
    import('@/views/RegistrationView/RegistrationView').then((m) => ({
      default: m.RegistrationView,
    })),
  ),
  ShareView: lazy(() =>
    import('@/views/ShareView/ShareView').then((m) => ({ default: m.ShareView })),
  ),
})

type SecondaryViews = ReturnType<typeof loadSecondaryViews>

// The mobile bottom-sheet snap ladder (ascending). vaul reads a string as pixels, a
// number as a fraction of the sheet height):
//  - '80px'  peek — the handle + the search / title row
//  - '300px' lower third — title + a list row + a peek of the next
//  - 0.97    near-full
const SNAP_POINTS = ['80px', '300px', 0.97]
const PEEK_SNAP = '80px' // the collapsed peek
const OPEN_SNAP = '300px' // default, and what the peek expands to
const WIDE_SNAP = SNAP_POINTS[2] // the near-full snap the full-width calendar opens at

// How far each stacked ancestor peeks out behind the active sheet. Wide enough to read
// as a deliberate stack of cards from across the screen (an earlier few-pixel sliver was
// easy to mistake for a border), while still leaving the active sheet unambiguously on
// top.
const PEEK_MOBILE = 10 // px above the sheet's top edge
const PEEK_DESKTOP = 12 // px to the right of the left panel

// Frames a stationary sheet holds before the `--sy-sheet-top` mirror parks itself (about
// 0.5s at 60fps — well past the end of any vaul spring). See the effect below for why it
// parks at all.
const IDLE_FRAMES = 30

// One uniform peek width per stack: every ancestor shares the same gap, and that gap
// shrinks as the TOTAL depth grows. So each level stays evenly spaced while a taller
// stack reads denser. `base` is the single-ancestor gap. Strip d sits at `d · gap`.
const PEEK_DECAY = 0.78
const perLevelPeek = (total: number, base: number) => base * Math.pow(PEEK_DECAY, total - 1)

// Opacity of the stacked ancestors, fading with depth so the stack recedes rather than
// competing with the active sheet. The nearest ancestor stays nearly solid, so its
// peeking edge reads as a panel. Deeper ones drop away but never fully vanish.
const peekOpacity = (depth: number) => Math.max(0.25, 0.8 - (depth - 1) * 0.2)

type Direction = 'left' | 'bottom'

// Dispatches the active (top) view's inner content. Only the top view renders —
// ancestors are peek panels, not rendered views — so each view frames the map for its
// own level on mount.
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
  }
}

// Every other control in the app draws this ring on focus. The strips drew nothing, so
// tabbing into the stack was invisible. `ring-inset` matters because only a thin edge of
// each strip escapes the sheet in front of it — an outset ring would paint into the
// sheet's territory, which sits at a higher z-index, and never be seen.
const PEEK_FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'

// A simulated ancestor drawer: a semi-transparent panel stacked behind the active sheet,
// so the stack reads as one set of fading cards over the map, rather than two separate
// drawers. On mobile it sits `depth * PEEK` above the sheet's *live* top (mirrored onto
// `--sy-sheet-top` every frame by DrawerStack), so it tracks a drag with no lag. Clicking
// it pops straight to that ancestor.
function PeekStrip({
  depth,
  gap,
  direction,
  zIndex,
  opacity,
  label,
  onClick,
}: {
  depth: number
  gap: number
  direction: Direction
  zIndex: number
  opacity: number
  label: string
  onClick: () => void
}) {
  // TODO(rtl, #52 WS8): the strip geometry (inline left/right plus the framer x
  // offsets below) is direction-sensitive. Mirror it alongside the Drawer atom's
  // `left` variant when an RTL locale ships.
  const isLeft = direction === 'left'
  const style: CSSProperties = { position: 'fixed', zIndex }
  let className: string

  if (isLeft) {
    // Matches the drawer atom's left variant: flush and square on tablet, floating
    // and rounded at ≥lg — the geometry lives in these classes, not in inline styles.
    // The width is the paired `22rem` value — its twin is `DRAWER_W_REM` in
    // `hooks/use-map-controller.tsx`. See the Drawer atom for why.
    // ⚠ Uses `max-w-[calc(100%-2rem)]`, not `100vw`: these panels are `position: fixed`,
    // so inside a frame (#169) a viewport unit describes a box they are not in. A
    // percentage resolves against the containing block — the frame where there is one,
    // the viewport where there is not. This is inert either way today (the anchored
    // panel only renders at ≥768px, where `22rem` always fits), which is exactly why it
    // is worth fixing before that stops being true.
    className =
      'inset-y-0 start-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100%-2rem)] rounded-none border border-divider bg-background shadow-xl lg:inset-y-4 lg:start-4 lg:rounded-2xl'
  } else {
    style.left = 0
    style.right = 0
    style.height = 'var(--sy-frame-h)'
    // `top` tracks the sheet's live position (rAF). The depth offset is the animated
    // transform below. So drag-tracking stays instant while the stack itself eases.
    style.top = 'var(--sy-sheet-top, var(--sy-frame-h))'
    className = 'rounded-t-2xl border-t border-divider bg-background shadow-xl'
  }

  // The stack slides out to make room as it grows, and back in as it shrinks. Each
  // panel eases from flush with the sheet edge (offset 0) out to `depth · gap`, where
  // `gap` is one uniform per-level width for the whole stack (tighter the deeper the
  // stack goes — computed once by DrawerStack). A newly stacked panel enters from under
  // the sheet while the existing panels shift further out, and the reverse happens on
  // close.
  const offset = isLeft ? { x: depth * gap } : { y: -depth * gap }
  const flush = isLeft ? { x: 0 } : { y: 0 }

  return (
    <motion.button
      animate={{ ...offset, opacity }}
      aria-label={label}
      className={clsx(className, PEEK_FOCUS)}
      exit={{ ...flush, opacity: 0 }}
      initial={{ ...flush, opacity: 0 }}
      style={style}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      type="button"
      onClick={onClick}
    />
  )
}

// The whole drawer navigation, derived purely from the pathname. ONE persistent vaul
// drawer holds the active (top) view. Its ancestors are simulated as semi-transparent
// peek panels behind it. Because the sheet renders once (DrawerStack owns the
// DrawerContent, and views are just its inner content), navigating never remounts or
// re-slides the drawer — the inner content cross-fades instead. Every view is handled
// the same way: dismissing navigates to the parent, and the one view with no parent
// (CountriesView) collapses to its peek instead of closing. Direction is left at ≥md,
// bottom on mobile. Map-less, the single drawer fills the widget container.
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
  // DrawerStack re-renders on every geocoder keystroke.
  const { t, locale } = useLocale()
  // Read unconditionally, like every other seam consumer: with no surface above this
  // component, it is the no-op provider, and the Escape ladder below simply ends where
  // it always did.
  const { collapse } = useExpansion()
  const queryClient = useQueryClient()
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  // How wide the WIDGET is, not the screen (issue #107). `container` is the map-less
  // layout root below — the box the host sized. In map mode there is no such element,
  // and until #169 there was nothing to measure at all: the widget spanned the
  // viewport, so `useIsWide` fell back to it. Now map mode can have a FRAME — a
  // contained embed's own box, or the compact card's expanded dialog — and where one
  // exists it is the honest answer to "does a 22rem side panel leave usable space
  // beside it?", because the panel sits inside it. With no frame, this call is
  // `useIsWide(null)`, exactly what it always computed. So a 320px column embed on a
  // desktop gets the bottom sheet, its drag handle, and its swipe-dismiss — and a 600px
  // contained map now does too. Shared with the subtree via `WidgetWidthContext` at the
  // foot of this component, so no descendant can disagree with the drawer it sits in.
  const isWide = useIsWide(container ?? frameElement())
  const direction: Direction = isWide ? 'left' : 'bottom'
  const [snap, setSnap] = useState<number | string | null>(OPEN_SNAP)
  const stripsRef = useRef<HTMLDivElement>(null)
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
  const baseEntries = useMemo(
    () => (filterOverlay ? entries.slice(0, -1) : entries),
    [filterOverlay, entries],
  )

  // Reads through `baseStackEntry` rather than `baseEntries.at(-1)` — the same value
  // either way, but stated in the shared vocabulary, so `top.path` is provably
  // `topViewKey(location.pathname, hasMap)`. `useFrameOnTop` compares itself against
  // that key to tell whether it is still the view on top, and the two agreeing is what
  // makes the comparison mean anything.
  const top = baseStackEntry(entries, hasMap) ?? null
  // The calendar is the one full-width view — it fills the widget (minus the floating
  // margins) instead of the ~22rem left panel (see the Drawer `wide` variant) — EXCEPT
  // in its list (agenda) view, which is a single narrow column and reads better at the
  // regular width. The live Schedule-X view is mirrored into `useCalendarPosition`
  // (read reactively here so switching month/list resizes the drawer. Date changes do
  // not re-render this component).
  const calendarView = useCalendarPosition((s) => s.view)
  const wide = top?.kind === 'calendar' && calendarView !== 'list'
  // Ancestor paths below the top view, root-first (empty at CountriesView).
  const parentPaths = useMemo(
    () => (baseEntries.length === 0 ? [] : ['/', ...baseEntries.slice(0, -1).map((e) => e.path)]),
    [baseEntries],
  )
  const parentPath = parentPaths.at(-1)
  const canCollapse = hasMap && direction === 'bottom'

  // The stack must show the panels a repeated X actually goes through, which is a
  // history question, not a URL one (see `dismissDepth`). `entryAncestors` is the
  // structural height of the last depth-0 location — remembered because once history
  // has pushed past it, the URL no longer tells us where the widget came in.
  //
  // A ref, not state: it is only ever READ at depth > 0, and only ever WRITTEN at
  // depth 0 — where `dismissDepth` uses the live ancestor count instead. So a write can
  // never change the current render's output, and making it reactive would only buy a
  // second render of the whole stack. This gets the same non-reactive treatment as
  // `useCameraHistory`, for the same reason.
  // Seeded at 0, NOT at `parentPaths.length`: mounting already at depth > 0 (a reload
  // keeps `history.state`) would otherwise make the cap always bind —
  // `min(ancestors, depth + ancestors) === ancestors` — quietly restoring the
  // URL-ancestor count this replaced. Neither seed is right after such a reload (the
  // entry we would climb from is no longer knowable), so this prefers the seed that can
  // only UNDER-count: a card that no dismiss visits is the bug being fixed, while a
  // missing card is just a shallower-looking stack.
  const depth = atlasDepth(location)
  const entryAncestors = useRef(0)

  useEffect(() => {
    if (depth === 0) entryAncestors.current = parentPaths.length
  }, [depth, parentPaths.length])

  // Strips are the FIRST n ancestors (root-first): with history in play, the nearest
  // URL ancestor may not be where back actually lands, but the root end of the chain
  // is. So counting from the root keeps the click targets closest to the truth.
  const stackDepth = dismissDepth({
    depth,
    entryAncestors: entryAncestors.current,
    ancestors: parentPaths.length,
  })
  const stackPaths = parentPaths.slice(0, stackDepth)

  // The peek strips' accessible names, resolved from caches the app has already
  // filled.
  //
  // Read through `getQueryData` rather than a `useQuery({ enabled: false })` pair —
  // which is how `DrawerChrome` does the same lookup. The difference is this
  // component's lifetime, not taste. `DrawerChrome` mounts only while a view is
  // loading or has thrown. DrawerStack stays mounted for the whole session, so an
  // observer here would be a permanent one, and React Query counts `gcTime` from the
  // moment the LAST observer unmounts. Two of the wholesale caches would then simply
  // never be collected — `WHOLESALE_GC_TIME` unreachable, one retained titles Map per
  // language visited — which is worst exactly where it is least visible: a
  // `map=false` embed idling on a host page.
  //
  // This stays cache-only, still through the shared factories (a read under a
  // divergent key does not error, it silently misses), and still free to miss: the
  // cost is the name, not the strip. The trade for dropping the subscription is that a
  // label appears on the next render, rather than the moment the cache fills — and
  // DrawerStack re-renders on every location change, which is the only time a strip
  // appears at all.
  //
  // Uses a Map, not the region array: `stripLabel` runs per strip per render, and the
  // region tree is the global list of every region in the world.
  const stripNames = useMemo(() => {
    // Uses explicit generics: these keys are plain tuples, rather than DataTag-carrying
    // ones, so `getQueryData` cannot infer what they hold.
    const regions = queryClient.getQueryData<RegionNode[]>(regionsQuery().queryKey)

    return {
      // A nameless region is dropped, rather than mapped to a blank, so it falls
      // through to `stripLabel`'s slug rung instead of naming the strip the empty
      // string.
      regionNames: new Map(
        regions?.flatMap((node) => (node.name ? [[node.slug, node.name] as const] : [])) ?? [],
      ),
      titles: queryClient.getQueryData<Map<number, string>>(eventTitlesQuery(locale).queryKey),
    }
  }, [queryClient, locale, location.pathname])

  // Mirrors the active sheet's live top onto the peek strips AND the sheet itself,
  // every frame, so both track a drag without waiting for the snap to settle (map plus
  // mobile only). The sheet-side copy is what pins EventView's sticky register bar to
  // the viewport edge — inside the transformed sheet, `position: fixed` resolves
  // against the sheet, so the bar offsets by the live top instead (issue #52, WS4).
  useEffect(() => {
    // Runs for every bottom-sheet view, root included. The strips and the sticky
    // register bar only exist above the root, but `--sy-sheet-top` now has a third
    // consumer: the error and loading bodies centre themselves within the VISIBLE
    // sheet, and the root can fail too (a cold `['countries']` read). Without the
    // variable there, they would centre inside a body that is `h-dvh` tall while only
    // its top 300px is on screen — below the fold, which is the same bug that made
    // both states invisible on mobile in the first place (issue #89).
    if (!hasMap || direction !== 'bottom') return
    let raf = 0
    let still = 0
    let last = Number.NaN
    // Looks the sheet up lazily (it mounts with this effect) and caches it — no need
    // to re-query the DOM every frame. `isConnected` is what makes caching safe now
    // that the effect no longer re-runs per depth change: two elements carry
    // `[data-vaul-drawer]` (the main sheet and the filter overlay), so a resize across
    // the md breakpoint can leave this holding the overlay — and once that overlay
    // closes, a detached node measures `top: 0` and would write `--sy-sheet-top: 0px`
    // onto the LIVE strips, pinning every peek to the top.
    //
    // ⚠ **Scoped to our own portal target, not `document`.** Both drawers portal
    // through `overlayContainer()` — the frame, or the theme root — never
    // `document.body`, whatever an older comment here claimed. A document-wide query
    // reaches the HOST's DOM, and vaul is a common shadcn dependency: a drawer of
    // theirs, earlier in document order, would win, and this code would then write an
    // inline `--sy-sheet-top` onto a host node every frame, while our own strips took
    // their offset from somebody else's box.
    let sheet: HTMLElement | null = null
    const tick = () => {
      if (!sheet?.isConnected) {
        sheet = (overlayContainer() ?? document).querySelector<HTMLElement>('[data-vaul-drawer]')
      }
      const el = stripsRef.current

      // No sheet still counts as a settled frame: counting it as movement would
      // re-arm the loop (and re-run the query) every frame forever, which is exactly
      // the cost this parks to avoid.
      if (!sheet) {
        still += 1
      } else {
        // Measured against the box the fixed layer resolves against, not the
        // viewport. `getBoundingClientRect().top` is a VIEWPORT coordinate, and it is
        // consumed as `top:` on fixed peek strips and `bottom:` on the sticky
        // Register bar — both of which a frame contains (`contain: layout`). Left
        // raw, every one of them sat 16-32px out inside the expanded dialog, by
        // exactly its margin. Contained on a host's page (#169), the error becomes
        // however far down their page the element sits, which is unbounded. With no
        // frame, the offset is zero, so this stays the same number it always was.
        // Reads from the node the overlay module already tracks, NOT
        // `document.querySelector('[data-sy-frame]')`: that would search the host's
        // whole document, so an element of theirs carrying the attribute would win on
        // document order and offset every strip by its box. Its RECT is still read
        // per frame — the dialog's inset changes at the `sm:` crossing, and a
        // contained frame moves with the host's own scrolling — but the lookup
        // itself is a module read, not a query.
        // ⚠ Guarded, like `decideSlot`'s read, and for the same reason: hosts patch
        // `getBoundingClientRect` (consent wrappers, anti-fingerprinting extensions).
        // A THROW here would kill the loop permanently — the `raf =` reassignment
        // below would never run — and then re-throw into the host's `window.onerror`
        // on every wake event. A `NaN` is worse than it looks: `top === last` is
        // never true, so `still` resets every frame and the loop never parks,
        // spending a forced layout flush per frame on somebody else's page.
        let top = Number.NaN

        try {
          top =
            sheet.getBoundingClientRect().top - (frameElement()?.getBoundingClientRect().top ?? 0)
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
          el?.style.setProperty('--sy-sheet-top', `${top}px`)
        }
      }

      // Parks once the sheet has held still, and lets the events that can move it
      // wake the loop back up. Reading `getBoundingClientRect` forces a style/layout
      // flush, so an always-on loop would spend the map's frame budget on exactly the
      // most constrained devices — and the sheet stays stationary for almost all of a
      // session. Half a second of stillness is well past the end of any vaul spring.
      raf = still > IDLE_FRAMES ? 0 : requestAnimationFrame(tick)
    }

    // Only OUR events wake it. These listen on the host page's document (the sheet is
    // portaled, and the pointer goes down on whatever is inside it), so an unfiltered
    // handler would restart the loop on any click anywhere on the embedding page — and
    // on any CSS transition it runs, which on a transition-heavy host would mean the
    // loop never parks at all. That would spend a third party's main-thread budget to
    // solve a problem that is ours. `resize` has no meaningful target and falls
    // through, which is correct.
    const wake = (event?: Event) => {
      const target = event?.target

      // A transition only moves the top edge when it is the SHEET's own — vaul
      // animates the sheet element. Every `transition-colors` hover on a button
      // inside it would otherwise re-arm 30 frames of layout reads for a colour
      // change.
      if (event?.type === 'transitionrun' && target !== sheet) return
      if (target instanceof Node && sheet && !sheet.contains(target)) return

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

  // The calendar opens at the near-full snap on mobile — its month grid AND its list
  // both need the height — while every other view keeps the third-height open snap.
  // Keyed on the view KIND (not `wide`), so switching the calendar between
  // month/week/list keeps it tall, rather than collapsing the list to the short snap.
  // This runs only when navigating to or from the calendar, so it never fights a
  // manual drag on a non-calendar view.
  useEffect(() => {
    if (direction === 'bottom') setSnap(top?.kind === 'calendar' ? WIDE_SNAP : OPEN_SNAP)
  }, [direction, top?.kind])

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
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? OPEN_SNAP : PEEK_SNAP)),
      dismiss: () => {
        // Marks the dismiss navigation as a transition: unmounting a heavy view (the
        // calendar's large grid) would otherwise reconcile synchronously and freeze
        // the click for a beat ("nothing happened"). As a transition, React keeps the
        // UI responsive and swaps the view when it is ready.
        if (action === 'collapse') setSnap(PEEK_SNAP)
        else
          startTransition(() => {
            if (action === 'back') navigate(-1)
            else if (parentPath) navigate(toStackTarget(parentPath)) // 'fallback'
          })
      },
    }
  }, [snap, canCollapse, parentPath, depth, location, navigate, toStackTarget])

  // The filter overlay's own dismiss (its X / swipe / Esc): back to the calendar it
  // opened over — chronologically when there is in-widget history, otherwise a direct
  // climb (with the query kept).
  const overlayControl = useMemo(
    () => ({
      collapsed: false,
      canCollapse: false,
      // Always parented to the calendar, so its X always goes somewhere.
      canDismiss: true,
      toggle: () => {},
      // The same back-vs-climb decision as `control` (via `dismissAction`), but the
      // overlay is always parented to the calendar (`hasParent: true` → never
      // 'collapse'), so 'fallback' climbs to `/calendar` directly, keeping its query.
      dismiss: () =>
        dismissAction({ hasParent: true, depth }) === 'back'
          ? navigate(-1)
          : navigate({ pathname: '/calendar', search: location.search }),
    }),
    [location, navigate],
  )

  // Whether the sheet advertises its drag affordance (issue #107). The atom's default
  // is `direction === 'bottom' && mode !== 'filled'`, which was right while `filled`
  // (map-less) could only ever be the wide left panel — "nothing to drag". Once the
  // sheet is container-aware, a narrow map-less embed becomes a `filled` BOTTOM sheet
  // that IS drag-dismissible, and that default would leave it dismissible with nothing
  // on screen saying so: an invisible affordance.
  //
  // Keyed on dismissibility rather than on the mode, so it can never claim one that
  // is not there: the map-less ROOT view sets `dismissible={false}` (no parent to
  // climb to), and correctly keeps no handle. Map mode is always dismissible, so this
  // resolves to the atom's old answer there.
  const sheetDismissible = hasMap || parentPaths.length > 0
  const sheet = (
    <DrawerContent
      aria-label={t('free_meditation_classes')}
      handle={direction === 'bottom' && sheetDismissible}
      /**
       * The last rung of the Escape ladder, and the only place it can be built.
       *
       * A drawer is always the TOPMOST dismissable layer — vaul is a Radix dialog
       * underneath — and Radix delivers Escape to the topmost layer alone. So
       * nothing containing the widget can ever see the key. Inside a compact
       * embed, the thing containing it is the expanded surface, whose collapse
       * control is otherwise the only way out. If the host has hidden, confined,
       * or scrolled that control away, a visitor with no Escape is locked out of
       * the page until they reload (issue #161).
       *
       * The ladder runs innermost-first: the stack dismisses while it has
       * somewhere to go, the sheet collapses to its peek while it can, and only
       * then does the key belong outward. `collapse()` is a no-op with no
       * surface above this component — the seam's whole point — so a normal
       * embed reaches this line and nothing changes. At that point vaul's own
       * dismissal was already a no-op too (`dismissAction` returns 'collapse',
       * and the sheet is either already collapsed or has no snap points left to
       * collapse to).
       */
      onEscapeKeyDown={(event) => {
        if (control.canDismiss || (control.canCollapse && !control.collapsed)) return

        event.preventDefault()
        collapse()
      }}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={top?.path ?? '/'}
          animate={{ opacity: 1 }}
          className="flex min-h-0 flex-1 flex-col"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
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
              <TopView entry={top} parentPath={parentPath ?? '/'} secondary={secondary} />
            </ResetErrorBoundary>
          </Suspense>
        </motion.div>
      </AnimatePresence>
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
        <DrawerContent aria-label={t('filters.title')}>
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
  // reveal, so no peek strips or snap ladder). Standalone owns the viewport
  // (100dvh). Embedded fills the host's slot (100%).
  if (!hasMap) {
    return (
      <WidgetWidthContext.Provider value={isWide}>
        <DrawerControlContext.Provider value={control}>
          <div
            ref={setContainer}
            className="relative w-full overflow-hidden bg-background"
            style={{ height: standalone ? '100dvh' : '100%' }}
          >
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
            {/* Map-less, the drawer fills the container and its search header owns
              the top, so a top-left cog would cover the search field. This keeps it
              on the left but at the bottom, clear of the header. side="top" opens
              the menu upward from there. z-50 so it sits above the fill-the-container
              drawer content (z-40, and portaled in last) — otherwise a list row
              would intercept its clicks. */}
            <SettingsMenu className="absolute bottom-3 start-3 z-50" side="top" />
          </div>
        </DrawerControlContext.Provider>
      </WidgetWidthContext.Provider>
    )
  }

  // Map mode: stacked ancestor panels (portaled behind the drawer) plus the single
  // drawer.
  const target = overlayContainer()
  // One uniform per-level peek width for the whole stack, tighter the deeper it goes
  // — computed once here (it is a stack constant) rather than per strip.
  const peekGap = perLevelPeek(stackDepth, direction === 'left' ? PEEK_DESKTOP : PEEK_MOBILE)
  // Always renders the container plus AnimatePresence (even at 0 ancestors), so a
  // removed strip animates out on the way back to the root, instead of vanishing.
  const strips = (
    <div ref={stripsRef}>
      <AnimatePresence>
        {stackPaths.map((path, i) => {
          const stripDepth = stackPaths.length - i
          // `parentPaths` is `['/', ...baseEntries.slice(0, -1).map(e => e.path)]`, so
          // strip `i` is entry `i - 1`, and strip 0 is the root (no entry). `stackPaths`
          // only slices that array, so the alignment survives.
          const ancestor = baseEntries[i - 1]

          return (
            <PeekStrip
              key={path}
              depth={stripDepth}
              direction={direction}
              gap={peekGap}
              label={stripLabel(ancestor, { t, ...stripNames })}
              opacity={peekOpacity(stripDepth)}
              zIndex={30 + i}
              onClick={() => navigate(toStackTarget(path))}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )

  return (
    <WidgetWidthContext.Provider value={isWide}>
      <DrawerControlContext.Provider value={control}>
        {target &&
          createPortal(
            <>
              {strips}
              {/* Inline-start, offset past the drawer on ≥md (flush at tablet,
                floating in by 4 at ≥lg), so it never overlaps the panel. Uses the
                logical `start-*`, rather than `left-*`: under RTL the drawer flips to
                the right edge, and the cog has to travel with it. On mobile the
                sheet sits at the bottom, so the top-left corner stays clear. */}
              {/* Uses top-3 on mobile/tablet. At ≥lg the drawer floats (lg:inset-y-4),
                so this bumps the cog to top-4 to line up with the drawer's top edge.
                Hidden on the full-width calendar — a focused view with no clean
                corner for the floating cog — settings stay reachable from every
                other view. */}
              {/* The inline-start gap clears the PEEK STRIPS, not just the drawer:
                the deepest stack pushes an ancestor about 23px past the panel edge
                (`PEEK_DESKTOP` times the decay series above), so the cog sits 2rem
                out — 3rem at ≥lg, where the drawer itself is already inset by
                1rem. That leaves about 9px of air at the deepest stack. A tighter
                gap would render the strips under the cog.
                Both `22rem` fallbacks below are the drawer-width pair — the twin
                value is `DRAWER_W_REM` in `hooks/use-map-controller.tsx`. */}
              {!wide && (
                <SettingsMenu
                  className={clsx(
                    'fixed top-3 z-40',
                    // ⚠ **Uses `isWide`, not a `md:` variant — the #169 correction.**
                    // This clears the LEFT PANEL, so it has to agree with whatever
                    // decided there is one — and that is now the frame's width, not
                    // the viewport's. A 600px contained map on a desktop gets the
                    // bottom sheet, and a viewport variant would still push the cog
                    // 384px right for a panel that is not there. At a 400px frame it
                    // would land past the edge, where the frame's `overflow-hidden`
                    // clips it away entirely. Outside a frame, `isWide` IS the
                    // viewport's answer, so this stays the same offset it always was.
                    isWide
                      ? 'start-[calc(var(--sy-drawer-w,22rem)+2rem)] lg:start-[calc(var(--sy-drawer-w,22rem)+3rem)] lg:top-4'
                      : 'start-3',
                  )}
                />
              )}
            </>,
            target,
          )}
        <Drawer
          key={direction}
          dismissible
          open
          activeSnapPoint={direction === 'bottom' ? snap : undefined}
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
          setActiveSnapPoint={direction === 'bottom' ? setSnap : undefined}
          snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
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
