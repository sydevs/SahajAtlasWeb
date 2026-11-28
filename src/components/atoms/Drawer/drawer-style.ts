import { tv } from '@/styles/tv'

// The drawer's geometry, apart from vaul, so the boot panel (`views/BootFallback`) can stand
// exactly where the drawer will open before the interface's code, vaul included, has arrived.
// Marks a band hosting a `SearchField`: the suggestion list runs from the field to the band's
// end (`MapSearch` measures it), since a dropdown narrower than the band left the list's counts
// peeking out beside it. This belongs to the bands rather than the views that mount a field,
// which drifted: the error chrome mounts a live field (`views/fallbacks.tsx`).
export const RESULTS_BAND = 'sy-results-band'

// The scroll padding a body needs beside a `sticky` footer, so focus never parks a field behind
// the bar: the footer's published height, plus the sheet's live top, since the body's bottom
// edge sits that far below the viewport where the bar paints (#326).
export const STICKY_FOOTER_CLEARANCE =
  'scroll-pb-[calc(var(--sy-footer-h,0px)_+_var(--sy-sheet-top,0px))]'

export const drawer = tv({
  slots: {
    // ⚠ Clip, never hidden — `components/AGENTS.md` carries why (#326). The panel's own
    // overflow is vaul's `::after` filler, which no view creates and none can decline, so
    // this one belongs on the atom. Measured at 390×844: `scrollTop: 762` before it.
    content:
      'pointer-events-auto fixed z-40 flex flex-col overflow-clip bg-background text-foreground shadow-2xl outline-none',
    // Every content band is capped at `--sy-content-max` (default 512px) and
    // centred. So on a wide surface, such as a large-mobile bottom sheet, the
    // views read as a centred column, instead of stretching edge to edge. This
    // has no effect on the 384px anchored panel, which is already narrower.
    // ⚠ The wider gap and bottom padding on a touch screen are the 44px tap floor, not
    // spacing taste (#432): the header's controls are drawn at 32px and each grows an
    // invisible 44px area, 6px past its own box on every side. At the 8px gap two of those
    // areas overlapped, the later control took the shared pixels, and every control but the
    // last measured 40px wide. The room is what lets each one have its own.
    header: `${RESULTS_BAND} mx-auto flex w-full max-w-[var(--sy-content-max,512px)] shrink-0 items-center gap-2 px-gutter pt-4 pb-2 pointer-coarse:gap-3 pointer-coarse:pb-3`,
    // A second fixed band under the header, for controls that act on the
    // scrolling content below, such as SearchView's Filters and Sort. It
    // shares the header's width cap and `shrink-0`. It sits OUTSIDE the body,
    // so a long list scrolls under it instead of carrying it away. That is
    // exactly when those controls become useful.
    toolbar: 'mx-auto w-full max-w-[var(--sy-content-max,512px)] shrink-0',
    // `overscroll-y-none` stops a list's scroll, flung to its end, chaining into Safari's page
    // pull. `useSheetDragClaim` handles the slow drag that starts at the top.
    // `overflow-x-hidden` is a backstop, not the fix. A drawer is a
    // fixed-width panel and must never scroll sideways. But it renders
    // host-authored prose, so one unbreakable string could always overflow
    // it. Content wraps at the source instead (see EventDetails'
    // `break-words`). This class only means the next such string degrades to
    // a clipped edge, instead of a horizontal scrollbar across the view. It
    // is safe for popovers, which portal out of the body entirely.
    // The trailing spacer clears a `sticky` footer, which is out of flow, so
    // the body runs underneath it and the end of the content is otherwise
    // unreachable. The length is the footer's own, published by `DrawerFooter`,
    // and zero wherever no sticky footer exists.
    // ⚠ A spacer and not this slot's own `pb-*`: tailwind-merge drops a slot
    // `pb-*` for any caller shorthand, and four bodies already pass `py-4`, so
    // the first of them to gain a sticky footer would bury its own content with
    // every lane green. A variant-prefixed class conflicts with no caller
    // class, and the spacer adds to their padding instead of replacing it. It
    // is a pseudo-element so `[&>:last-child]` postures still find the real
    // last child (`CENTERED_BODY`).
    body: "mx-auto min-h-0 w-full max-w-[var(--sy-content-max,512px)] flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none after:block after:h-[var(--sy-footer-h,0px)] after:shrink-0 after:content-['']",
    footer:
      'mx-auto mt-auto w-full max-w-[var(--sy-content-max,512px)] shrink-0 border-t border-gray-4',
    // This themes the vaul drag handle. Its vendored CSS hardcodes a light
    // grey. This gives the handle breathing room from the sheet's rounded top
    // edge, but keeps it close to the header below. It also adds a grab
    // cursor, so the drag affordance reads on pointer devices.
    handle: 'mt-2.5 mb-1 cursor-grab !bg-gray-7 active:cursor-grabbing',
  },
  variants: {
    direction: {
      // Flush to the edge on tablet (md–lg). At ≥lg it floats with a margin, so
      // the map shows around it, rounded.
      //
      // TODO(rtl, #52 WS8): the remaining RTL gap is vaul's own `direction`
      // prop. That prop is physically left or right, and it drives both the
      // drag axis and the enter animation. These inset classes cannot fix
      // that alone. DrawerStack picks the direction, so the flip belongs
      // there and here together — and with the map's control column, which is
      // physically `top-right` (`organisms/Mapbox/MapControls.tsx`). This is
      // deferred until an RTL locale actually ships. Everything else here is
      // already logical: the stack's panel positioning uses `start-*`, and
      // directional icons carry `rtl:-scale-x-100` at their call sites.
      //
      // The left inset is the notch or Dynamic Island of a phone held sideways (`viewport-fit=cover`
      // runs the page under it). The panel widens by the inset and pads it, so its content keeps
      // the full width clear of the cut-out. Zero everywhere else.
      //
      // **The `384px` in both variants below is paired with `DRAWER_W_PX` in
      // `hooks/use-map-controller-mapbox.tsx`.** That constant becomes the map's
      // left camera padding, so the map knows how much of itself this panel
      // covers. Tailwind needs a literal here, and it cannot read the
      // constant. So changing this width means changing that one in the same
      // edit. Otherwise the map keeps framing around the old width, and
      // nothing anywhere reports the drift.
      // Floating (≥lg), the panel is as tall as its view, up to the frame's height less its
      // margins. While someone is typing in the place search it takes the full height, since the
      // suggestions open inside it and it clips. Keyed on the typing, not on the list being open:
      // Mapbox opens and closes the list on every response, and the panel would follow each one.
      left: {
        content:
          'inset-y-0 left-0 w-[calc(var(--sy-drawer-w,384px)+env(safe-area-inset-left,0px))] max-w-[calc(100%-32px)] rounded-none border border-divider ps-[env(safe-area-inset-left,0px)] lg:top-4 lg:bottom-auto lg:left-4 lg:max-h-[calc(var(--sy-frame-h)-32px)] lg:rounded-2xl lg:has-[[role=search]:focus-within_input:not(:placeholder-shown)]:h-[calc(var(--sy-frame-h)-32px)]',
      },
      right: {
        content:
          'inset-y-0 right-0 w-[var(--sy-drawer-w,384px)] max-w-[calc(100%-32px)] rounded-none border border-divider lg:inset-y-4 lg:right-4 lg:rounded-2xl',
      },
      // Snap-point sheets must use the full viewport height. Vaul computes
      // its snap translate from the window height, so a content-sized sheet
      // would get pushed off-screen. The 3dvh bottom padding keeps the
      // footer above the fold at the 0.97 top snap, since the last 3% stays
      // hidden.
      bottom: {
        content:
          'inset-x-0 bottom-0 h-[var(--sy-frame-h)] rounded-t-2xl border-t border-divider pb-[calc(var(--sy-frame-h)*0.03)]',
      },
      top: {
        content: 'inset-x-0 top-0 h-[var(--sy-frame-h)] rounded-b-2xl border-b border-divider',
      },
    },
    // How the panel relates to the page: a drawer over the map, or no drawer at all.
    mode: {
      /** Fixed to the viewport, anchored to the `direction` edge. This is the map layout. */
      anchored: {},
      /**
       * In the host page's flow, with no drawer at all: the inline embed's content column.
       * Nothing scrolls inside it, so the page grows to fit. The column lifts the bands' width
       * cap itself, through `--sy-content-max`.
       */
      // The first band drops its top padding, so whatever a view leads with starts level with
      // the map beside it: the column and the map's toolbar share the grid's rows
      // (`InlineColumns`).
      inline: {
        body: 'flex-none overflow-visible after:hidden first:pt-0',
        // A title naming the place the inline embed's page heading already names gives way to
        // that heading. `display: none` takes it out of the accessibility tree too, so this is
        // the same tree as not rendering it (`DrawerTitle`, `views/shared.tsx`).
        header: 'first:pt-0 [&_[data-sy-place]]:hidden',
        toolbar: 'first:pt-0',
      },
    },
    // A full-width surface, such as CalendarView, instead of the 384px left panel, so a month
    // grid stays legible.
    wide: { true: {}, false: {} },
  },
  compoundVariants: [
    // The bottom sheet shows a drag handle that already spaces the header
    // from the sheet's top edge. So this relaxes the header's top padding,
    // for a balanced handle-to-header gap.
    { direction: 'bottom', mode: 'anchored', class: { header: 'pt-2' } },
    // Wide, plus the anchored left panel: this fills the container, flush at
    // md and floating at lg, instead of the narrow left panel. `!important`
    // overrides the left variant's fixed width and edge insets.
    {
      direction: 'left',
      mode: 'anchored',
      wide: true,
      class: { content: '!inset-0 !w-auto !max-w-none lg:!inset-4' },
    },
  ],
  defaultVariants: { direction: 'bottom', mode: 'anchored', wide: false },
})

/**
 * The `--initial-transform` vaul starts a panel from (vendored in `styles/vaul.css`): its offset
 * along its axis, as a length or a share of its own size. A snap point in px leaves that much of
 * the panel showing; a fraction leaves that share; no snap point means fully open.
 */
export function inPlaceTransform(point: number | string | null | undefined): string {
  if (typeof point === 'string') return `calc(100% - ${point})`
  if (typeof point === 'number') return `${(1 - point) * 100}%`

  return '0px'
}
