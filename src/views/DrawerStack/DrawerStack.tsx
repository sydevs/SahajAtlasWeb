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
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import { Drawer, DrawerContent } from '@/components/atoms/Drawer'
import { ResetErrorBoundary, SettingsMenu } from '@/components/molecules'
import { useIsDesktop } from '@/config/responsive'
import { useWidgetMode } from '@/config/mode'
import { useCalendarPosition } from '@/config/store'
import { overlayContainer } from '@/lib/overlay'
import {
  type StackEntry,
  atlasDepth,
  dismissAction,
  dismissDepth,
  isFilterOverlay,
  resolveStack,
} from '@/lib/shape'
import { DrawerControlContext } from '@/views/shared'
import { DrawerErrorFallback, DrawerLoading } from '@/views/fallbacks'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { SearchView } from '@/views/SearchView/SearchView'
import { FilterView } from '@/views/FilterView/FilterView'
import { RegionView } from '@/views/RegionView/RegionView'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { EventView } from '@/views/EventView/EventView'

// The three views most visitors never open, split out of the eager graph (issue #96).
// Each is the only consumer of a large dependency the widget otherwise pays for at
// first paint on every host page: the calendar owns the whole Schedule-X stack (its
// grid, its views and its theme CSS), registration owns react-hook-form + the resolver,
// and share owns react-share's target composers.
//
// They are the RIGHT three to split because none of them can be the first thing on
// screen by accident: each is reached by pressing something (the calendar button, an
// event's Register / Share CTA) or by a deep link that is already a deliberate act.
// The views that CAN be the entry — the country index, a region, search, an event —
// stay eager, so the common path still resolves in the graph the host already fetched.
//
// Minted per attempt, not once at module scope, for the reason spelled out in
// `EventView.tsx`: React caches a lazy component's REJECTED payload forever, so a
// module-scope `lazy` would leave the drawer boundary's "Try again" re-throwing the
// stored rejection instantly — the visibly-does-nothing button issue #89 removed. The
// three are minted together because one reset serves one boundary; a fresh `lazy` for a
// view that did not fail costs nothing (the object is inert until rendered), and only
// one of them is ever mounted at a time.
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

// Mobile bottom-sheet snap ladder (ascending; vaul reads a string as px, a number
// as a fraction of the sheet height):
//  - '80px'  peek — the handle + the search / title row
//  - '300px' lower third — title + a list row + a peek of the next
//  - 0.97    near-full
const SNAP_POINTS = ['80px', '300px', 0.97]
const PEEK_SNAP = '80px' // the collapsed peek
const OPEN_SNAP = '300px' // default, and what the peek expands to
const WIDE_SNAP = SNAP_POINTS[2] // the near-full snap the full-width calendar opens at

// How far each stacked ancestor peeks out behind the active sheet. Wide enough to
// read as a deliberate stack of cards from across the screen (the earlier few-pixel
// sliver was easy to mistake for a border), while still leaving the active sheet
// unambiguously on top.
const PEEK_MOBILE = 10 // px above the sheet's top edge
const PEEK_DESKTOP = 12 // px to the right of the left panel

// Frames of a stationary sheet before the `--sy-sheet-top` mirror parks itself (~0.5s at
// 60fps — well past the end of any vaul spring). See the effect for why it parks at all.
const IDLE_FRAMES = 30

// One uniform peek width per stack: every ancestor shares the same gap, and that gap
// shrinks as the TOTAL depth grows — so each level stays evenly spaced while a taller
// stack reads denser. `base` is the single-ancestor gap; strip d sits at `d · gap`.
const PEEK_DECAY = 0.78
const perLevelPeek = (total: number, base: number) => base * Math.pow(PEEK_DECAY, total - 1)

// Opacity of the stacked ancestors, fading with depth so the stack recedes rather
// than competing with the active sheet. The nearest ancestor is nearly solid, so its
// peeking edge reads as a panel; deeper ones drop away but never vanish.
const peekOpacity = (depth: number) => Math.max(0.25, 0.8 - (depth - 1) * 0.2)

type Direction = 'left' | 'bottom'

// Dispatch the active (top) view's inner content. Only the top view is rendered
// (ancestors are peek panels, not rendered views), so each view frames the map for
// its level on mount.
//
// The three lazy views arrive as a prop rather than being read from module scope, so the
// identity that a boundary reset replaces is the one this renders — see `loadSecondaryViews`.
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

// A simulated ancestor drawer: a semi-transparent panel stacked behind the active
// sheet so the stack reads as one set of fading cards over the map rather than two
// separate drawers. On mobile it sits `depth * PEEK` above the sheet's *live* top
// (mirrored onto `--sy-sheet-top` every frame by DrawerStack), so it tracks a drag
// with no lag. Clicking pops straight to that ancestor.
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
  // TODO(rtl, #52 WS8): the strip geometry (inline left/right + the framer x
  // offsets below) is direction-sensitive — mirror alongside the Drawer atom's
  // `left` variant when an RTL locale ships.
  const isLeft = direction === 'left'
  const style: CSSProperties = { position: 'fixed', zIndex }
  let className: string

  if (isLeft) {
    // Match the drawer atom's left variant: flush + square on tablet, floating +
    // rounded at ≥lg — geometry lives in these classes, not inline styles.
    // Width is the paired `22rem` — twin is `DRAWER_W_REM` in
    // `hooks/use-map-controller.tsx`; see the Drawer atom for why.
    className =
      'inset-y-0 start-0 w-[var(--sy-drawer-w,22rem)] max-w-[calc(100vw-2rem)] rounded-none border border-divider bg-background shadow-xl lg:inset-y-4 lg:start-4 lg:rounded-2xl'
  } else {
    style.left = 0
    style.right = 0
    style.height = '100dvh'
    // `top` tracks the sheet's live position (rAF); the depth offset is the animated
    // transform below, so drag-tracking stays instant while the stack eases.
    style.top = 'var(--sy-sheet-top, 100dvh)'
    className = 'rounded-t-2xl border-t border-divider bg-background shadow-xl'
  }

  // The stack slides out to make room as it grows (and back in as it shrinks): each
  // panel eases from flush with the sheet edge (offset 0) out to `depth · gap`, where
  // `gap` is one uniform per-level width for the whole stack (tighter the deeper the
  // stack — computed once by DrawerStack). A newly-stacked panel enters from under the
  // sheet while the existing panels shift further out — and the reverse on close.
  const offset = isLeft ? { x: depth * gap } : { y: -depth * gap }
  const flush = isLeft ? { x: 0 } : { y: 0 }

  return (
    <motion.button
      animate={{ ...offset, opacity }}
      aria-label={label}
      className={className}
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
// drawer holds the active (top) view; its ancestors are simulated as semi-transparent
// peek panels behind it. Because the sheet is rendered once (DrawerStack owns the
// DrawerContent; views are just inner content), navigating never remounts/re-slides
// the drawer — the inner content cross-fades instead. Every view is handled the same
// way: dismissing navigates to the parent, and the one view with no parent
// (CountriesView) collapses to its peek instead of closing. Direction is left at ≥md,
// bottom on mobile. Map-less, the single drawer fills the widget container.
export function DrawerStack() {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { hasMap, standalone } = useWidgetMode()
  const { t } = useTranslation('common')
  const direction: Direction = isDesktop ? 'left' : 'bottom'
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [snap, setSnap] = useState<number | string | null>(OPEN_SNAP)
  const stripsRef = useRef<HTMLDivElement>(null)
  // The lazy components ARE the retry state — the boundary's reset swaps in fresh ones.
  // Held directly rather than as a counter a memo keys off, so the rule ("a retry needs a
  // new lazy") is the code rather than something to reconstruct from a dep array.
  // `useState` calls a function initializer, so this reads once. Same shape as EventView.
  const [secondary, setSecondary] = useState(loadSecondaryViews)

  const entries = useMemo(() => resolveStack(location.pathname), [location.pathname])
  // Filters over the full-width calendar (map mode) render as a separate modal drawer OVER
  // the still-mounted calendar — from the right at ≥md, a bottom sheet on mobile — rather
  // than replacing it. So the calendar stays the base view and the trailing `filters` entry
  // is peeled into the overlay below. (Map-less keeps the plain replace-stack behaviour.)
  const filterOverlay = isFilterOverlay(entries, hasMap)
  const baseEntries = useMemo(
    () => (filterOverlay ? entries.slice(0, -1) : entries),
    [filterOverlay, entries],
  )

  const top = baseEntries.at(-1) ?? null
  // The calendar is the one full-width view — it fills the widget (minus the floating
  // margins) instead of the ~22rem left panel (see the Drawer `wide` variant) — EXCEPT in
  // its list (agenda) view, which is a single narrow column and reads better at the regular
  // width. The live Schedule-X view is mirrored into `useCalendarPosition` (read reactively
  // here so switching month↔list resizes the drawer; date changes don't re-render this).
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
  // structural height of the last depth-0 location — remembered because once we've
  // pushed past it the URL no longer tells us where the widget came in.
  //
  // A ref, not state: it's only ever READ at depth > 0, and it's only ever WRITTEN
  // at depth 0 — where `dismissDepth` uses the live ancestor count instead — so a
  // write can never change the current render's output, and making it reactive just
  // bought a second render of the whole stack. Same non-reactive treatment as
  // `useCameraHistory`, for the same reason.
  // Seeded 0, NOT `parentPaths.length`: mounting already at depth > 0 (a reload keeps
  // `history.state`) would otherwise make the cap always bind —
  // `min(ancestors, depth + ancestors) === ancestors` — quietly restoring the
  // URL-ancestor count this replaced. Neither seed is right after such a reload (the
  // entry we'd climb from is no longer knowable), so prefer the one that can only
  // UNDER-count: a card that no dismiss visits is the bug being fixed, a missing card
  // is just a shallower-looking stack.
  const depth = atlasDepth(location)
  const entryAncestors = useRef(0)

  useEffect(() => {
    if (depth === 0) entryAncestors.current = parentPaths.length
  }, [depth, parentPaths.length])

  // Strips are the FIRST n ancestors (root-first): with history in play the nearest
  // URL ancestor may not be where back actually lands, but the root end of the chain
  // is, so counting from the root keeps the click targets closest to the truth.
  const stackDepth = dismissDepth({
    depth,
    entryAncestors: entryAncestors.current,
    ancestors: parentPaths.length,
  })
  const stackPaths = parentPaths.slice(0, stackDepth)

  // Mirror the active sheet's live top onto the peek strips AND the sheet
  // itself every frame, so both track a drag without waiting for the snap to
  // settle (map + mobile only). The sheet-side copy is what pins EventView's
  // sticky register bar to the viewport edge — inside the transformed sheet,
  // `position: fixed` resolves against the sheet, so the bar offsets by the
  // live top instead (issue #52, WS4).
  useEffect(() => {
    // Every bottom-sheet view, root included. The strips and the sticky register bar only
    // exist above the root, but `--sy-sheet-top` has a third consumer now: the error and
    // loading bodies centre themselves within the VISIBLE sheet, and the root can fail too
    // (a cold `['countries']` read). Without the var there they'd centre inside a body that
    // is `h-dvh` tall while only its top 300px is on screen — i.e. below the fold, which is
    // the bug that made both states invisible on mobile in the first place (issue #89).
    if (!hasMap || direction !== 'bottom') return
    let raf = 0
    let still = 0
    let last = Number.NaN
    // Look the sheet up lazily (it mounts with this effect) and cache it — no need to
    // re-query the DOM every frame. `isConnected` is what makes caching safe now that the
    // effect no longer re-runs per depth change: two elements carry `[data-vaul-drawer]`
    // (the main sheet and the filter overlay) and both portal to `document.body`, so a
    // resize across the md breakpoint can leave this holding the overlay — and once that
    // closes, a detached node measures `top: 0` and would write `--sy-sheet-top: 0px` onto
    // the LIVE strips, pinning every peek to the top of the viewport.
    let sheet: HTMLElement | null = null
    const tick = () => {
      if (!sheet?.isConnected) sheet = document.querySelector<HTMLElement>('[data-vaul-drawer]')
      const el = stripsRef.current

      // No sheet is still a settled frame: counting it as movement would re-arm the loop
      // (and re-run the query) every frame forever, which is the cost this parks to avoid.
      if (!sheet) {
        still += 1
      } else {
        const top = sheet.getBoundingClientRect().top

        if (top === last) {
          still += 1
        } else {
          still = 0
          last = top
          sheet.style.setProperty('--sy-sheet-top', `${top}px`)
          el?.style.setProperty('--sy-sheet-top', `${top}px`)
        }
      }

      // Park once the sheet has held still, and let the events that can move it wake the
      // loop back up. Reading `getBoundingClientRect` forces a style/layout flush, so an
      // always-on loop spends the map's frame budget on exactly the constrained devices —
      // and the sheet is stationary for almost all of a session. Half a second of stillness
      // is well past the end of any vaul spring.
      raf = still > IDLE_FRAMES ? 0 : requestAnimationFrame(tick)
    }

    // Only OUR events wake it. These listen on the host page's document (the sheet is
    // portaled, and the pointer goes down on whatever is inside it), so an unfiltered
    // handler would restart the loop on any click anywhere on the embedding page — and on
    // any CSS transition it runs, which on a transition-heavy host means the loop never
    // parks at all. That would spend a third party's main-thread budget to solve a problem
    // of ours. `resize` has no meaningful target and falls through, which is correct.
    const wake = (event?: Event) => {
      const target = event?.target

      // A transition only moves the top edge when it is the SHEET's own — vaul animates
      // the sheet element. Every `transition-colors` hover on a button inside it would
      // otherwise re-arm 30 frames of layout reads for a colour change.
      if (event?.type === 'transitionrun' && target !== sheet) return
      if (target instanceof Node && sheet && !sheet.contains(target)) return

      still = 0
      raf ||= requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    // The three ways the top edge moves: a drag (no transition — vaul writes the transform
    // per pointer event), a snap animation, and a viewport resize.
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

  // The calendar opens at the near-full snap on mobile — its month grid AND its list both need
  // the height — while every other view keeps the third-height open snap. Keyed on the view
  // KIND (not `wide`), so switching the calendar between month/week/list keeps it tall rather
  // than collapsing the list to the short snap; runs only when navigating to/from the calendar,
  // so it never fights a manual drag on a non-calendar view.
  useEffect(() => {
    if (direction === 'bottom') setSnap(top?.kind === 'calendar' ? WIDE_SNAP : OPEN_SNAP)
  }, [direction, top?.kind])

  // Uniform for every view: dismissing pops to the parent; the one view with no
  // parent (CountriesView) collapses to the peek instead of closing. Wired to both
  // the close/list buttons (via context) and vaul's swipe (onOpenChange).
  // The search view's query (center/bbox/q) is ambient context — keep it when
  // popping back into `/search` (e.g. closing the filters drawer stacked over it),
  // drop it when leaving search entirely. Only `/search` carries a query today.
  const toStackTarget = useCallback(
    (path: string) => (path === '/search' ? { pathname: path, search: location.search } : path),
    [location.search],
  )

  // History-aware dismiss (X / swipe / Esc): with in-widget history (depth > 0) go
  // chronologically back — which restores the prior camera and returns to exactly
  // where the user came from (a `/search` result closes back to those results, not
  // the event's parent region). A fresh deep link (depth 0) has no in-widget entry
  // to pop — and `navigate(-1)` would navigate the *host page* away (the embedded
  // widget shares browser history) — so it climbs to the structural parent instead.
  // The root view (no parent) collapses to its peek.
  const control = useMemo(() => {
    // Resolved ONCE and read by both members below, so `canDismiss` can't drift from what
    // pressing X actually does. The error fallback renders its own header (the view's is
    // inside the boundary that caught) and must not offer a close that no-ops: at the root
    // there is nothing to climb to, and `navigate(-1)` would take the HOST page back
    // (issue #89).
    const action = dismissAction({ hasParent: Boolean(parentPath), depth })

    return {
      collapsed: snap === PEEK_SNAP,
      canCollapse,
      canDismiss: action !== 'collapse',
      toggle: () => setSnap((s) => (s === PEEK_SNAP ? OPEN_SNAP : PEEK_SNAP)),
      dismiss: () => {
        // Mark the dismiss navigation as a transition: unmounting a heavy view (the calendar's
        // large grid) otherwise reconciles synchronously and freezes the click for a beat
        // ("nothing happened"). As a transition React keeps the UI responsive and swaps when ready.
        if (action === 'collapse') setSnap(PEEK_SNAP)
        else
          startTransition(() => {
            if (action === 'back') navigate(-1)
            else if (parentPath) navigate(toStackTarget(parentPath)) // 'fallback'
          })
      },
    }
  }, [snap, canCollapse, parentPath, depth, location, navigate, toStackTarget])

  // The filter overlay's own dismiss (its X / swipe / Esc): back to the calendar it opened
  // over — chronologically when there's in-widget history, else a direct climb (query kept).
  const overlayControl = useMemo(
    () => ({
      collapsed: false,
      canCollapse: false,
      // Always parented to the calendar, so its X always goes somewhere.
      canDismiss: true,
      toggle: () => {},
      // Same back-vs-climb decision as `control` (via `dismissAction`), but the overlay is
      // always parented to the calendar (`hasParent: true` → never 'collapse'), so 'fallback'
      // climbs to `/calendar` directly, keeping its query.
      dismiss: () =>
        dismissAction({ hasParent: true, depth }) === 'back'
          ? navigate(-1)
          : navigate({ pathname: '/calendar', search: location.search }),
    }),
    [location, navigate],
  )

  const sheet = (
    <DrawerContent aria-label={t('free_meditation_classes')}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={top?.path ?? '/'}
          animate={{ opacity: 1 }}
          className="flex min-h-0 flex-1 flex-col"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Suspense OUTSIDE the boundary, so a lazy view's chunk load is a suspend that
              shows `DrawerLoading` — the shared chrome (header + close control, rebuilt
              from the URL) over a spinner — and only a FAILED load throws inward to the
              boundary. That is what keeps a first open of the calendar / register / share
              drawer from flashing blank or unstyled: the drawer's identity is on screen
              from the first frame, and only its body arrives late (issue #96). */}
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

  // The filter overlay drawer (map mode only): a modal panel over the mounted calendar —
  // right at ≥md, bottom sheet on mobile — with its own control. FilterView's Apply/Clear
  // navigate to /calendar too, which closes it.
  const filterDrawer = filterOverlay ? (
    <DrawerControlContext.Provider value={overlayControl}>
      <Drawer
        key="filter-overlay"
        dismissible
        modal
        open
        direction={isDesktop ? 'right' : 'bottom'}
        handleOnly={isDesktop}
        onOpenChange={(o) => !o && overlayControl.dismiss()}
      >
        <DrawerContent aria-label={t('filters.title')}>
          {/* The one drawer in the app with no fence of its own — a throw here escaped to
              the app-level boundary and blanked the whole widget on the host page. Safe
              today only because FilterView reads exclusively through non-suspense
              `useQuery`; nothing structural was keeping it that way (issue #89). */}
          <Suspense fallback={<DrawerLoading />}>
            <ResetErrorBoundary FallbackComponent={DrawerErrorFallback}>
              <FilterView />
            </ResetErrorBoundary>
          </Suspense>
        </DrawerContent>
      </Drawer>
    </DrawerControlContext.Provider>
  ) : null

  // Map-less: one contained drawer fills the widget container (no map to reveal, so
  // no peek strips or snap ladder). Standalone owns the viewport (100dvh); embedded
  // fills the host's slot (100%).
  if (!hasMap) {
    return (
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
            // handle-only drag makes it undraggable — dismiss is the close button only.
            handleOnly={direction === 'left'}
            mode="filled"
            onOpenChange={(o) => !o && control.dismiss()}
          >
            {sheet}
          </Drawer>
          {/* Map-less the drawer fills the container and its search header owns the
              top, so a top-left cog would cover the search field. Keep it on the left
              but at the bottom, clear of the header; side="top" opens the menu upward
              from there. z-50 so it sits above the fill-the-container drawer content
              (z-40, and portaled in last) — otherwise a list row intercepts its clicks. */}
          <SettingsMenu className="absolute bottom-3 start-3 z-50" side="top" />
        </div>
      </DrawerControlContext.Provider>
    )
  }

  // Map mode: stacked ancestor panels (portaled behind the drawer) + the single drawer.
  const target = overlayContainer()
  // One uniform per-level peek width for the whole stack, tighter the deeper it goes —
  // computed once here (it's a stack constant) rather than per strip.
  const peekGap = perLevelPeek(stackDepth, direction === 'left' ? PEEK_DESKTOP : PEEK_MOBILE)
  // Always render the container + AnimatePresence (even at 0 ancestors) so a removed
  // strip animates out on the way back to the root instead of vanishing.
  const strips = (
    <div ref={stripsRef}>
      <AnimatePresence>
        {stackPaths.map((path, i) => {
          const stripDepth = stackPaths.length - i

          return (
            <PeekStrip
              key={path}
              depth={stripDepth}
              direction={direction}
              gap={peekGap}
              label={t('back')}
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
    <DrawerControlContext.Provider value={control}>
      {target &&
        createPortal(
          <>
            {strips}
            {/* Inline-start, offset past the drawer on ≥md (flush at tablet,
                floating in by 4 at ≥lg) so it never overlaps the panel. Logical
                (`start-*`) rather than `left-*`: under RTL the drawer flips to
                the right edge, and the cog has to travel with it. On mobile
                the sheet is at the bottom, so the top-left corner is clear. */}
            {/* top-3 on mobile/tablet; at ≥lg the drawer floats (lg:inset-y-4), so
                bump the cog to top-4 to line up with the drawer's top edge. Hidden on
                the full-width calendar — a focused view with no clean corner for the
                floating cog; settings stay reachable from every other view. */}
            {/* The inline-start gap clears the PEEK STRIPS, not just the drawer: the
                deepest stack pushes an ancestor ~23px past the panel edge
                (`PEEK_DESKTOP` × the decay series above), so the cog sits 2rem out
                — 3rem at ≥lg, where the drawer itself is already inset by 1rem. That
                leaves ~9px of air at the deepest stack; a tighter gap and the strips
                render under the cog.
                Both `22rem` fallbacks below are the drawer-width pair — twin is
                `DRAWER_W_REM` in `hooks/use-map-controller.tsx`. */}
            {!wide && (
              <SettingsMenu className="fixed start-3 top-3 z-40 md:start-[calc(var(--sy-drawer-w,22rem)+2rem)] lg:start-[calc(var(--sy-drawer-w,22rem)+3rem)] lg:top-4" />
            )}
          </>,
          target,
        )}
      <Drawer
        key={direction}
        dismissible
        open
        activeSnapPoint={direction === 'bottom' ? snap : undefined}
        direction={direction}
        // The left panel (≥md) has no handle and no snap points, so restricting drag
        // to the (absent) handle makes it undraggable — dismiss is the close button
        // only. The mobile bottom sheet keeps its full-panel snap-drag.
        handleOnly={direction === 'left'}
        setActiveSnapPoint={direction === 'bottom' ? setSnap : undefined}
        snapPoints={direction === 'bottom' ? SNAP_POINTS : undefined}
        wide={wide}
        onOpenChange={(o) => !o && control.dismiss()}
      >
        {sheet}
      </Drawer>
      {filterDrawer}
    </DrawerControlContext.Provider>
  )
}
