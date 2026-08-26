import { type ReactNode, useCallback, useState } from 'react'

import { useFrame } from '@/hooks/use-frame'
import { ELEMENT_NAME } from '@/lib/element'
import { reportIntegrationWarning } from '@/lib/report'

/**
 * The box a **contained** map embed lives in (issue #169).
 *
 * Map mode renders the canvas `position: fixed; inset: 0` and every drawer, peek strip and
 * cog over it is fixed too — so by default it fills the browser window whatever slot the host
 * gave `<sahaj-atlas>`, and #107 settled that as a documented requirement of the mode. That
 * requirement blocked the shape the WordPress plugin needs: a site's own header, then the atlas
 * below it. A static header was painted over; a sticky one floated above the map *and* above
 * the widget's drawers, covering the settings control.
 *
 * **Containment is one element, and it is the element the expanded dialog already proved.**
 * `contain: layout` makes an element the containing block for every fixed descendant, so the
 * whole interface re-parents onto this box with no `fixed` → `absolute` swap anywhere: the
 * canvas div, the drawers and the strips are byte-identical in both modes. The two arguments
 * that used to make containment intractable were retired by #161 and are load-bearing here:
 *
 * - **`--sy-frame-h`** — `100dvh` on `.sy-atlas`, `100%` under `[data-sy-frame]`. A `100%`
 *   height on a fixed child resolves against its containing block, which is this element here
 *   and the viewport everywhere else, so one token is right in both places.
 * - **vaul's own `container` prop** — `DrawerStack` hands it `frameElement()`, so a snap-point
 *   sheet computes its travel from this box rather than from `window.innerHeight`. Without it
 *   the library's own arithmetic pushes a contained sheet off-screen.
 *
 * `--sy-sheet-top` needed the matching correction and already has it: it is written from a
 * VIEWPORT coordinate and consumed as `top:`/`bottom:` on fixed children, so `DrawerStack`
 * subtracts the frame's own top (zero when there is no frame).
 *
 * ⚠ **`contain: layout` belongs here and NOWHERE up the tree.** `.claude/rules/components.md`
 * forbids it on the scope root, for this exact mechanism pointed the other way: there it would
 * re-parent the fixed layer onto the host's own element, which is a box a map-less embed shares
 * with the host's page. Here re-parenting is the entire point, and the element is ours.
 *
 * **It is also what gives the host a defined stacking relationship.** Layout containment makes
 * this a stacking context, so the widget's internal `z-30`…`z-50` stop competing with whatever
 * the host's CSS happens to produce and their page orders the atlas as one element — which is
 * why a sticky header can float over it, correctly, instead of over its drawers.
 *
 * **Rendering nothing when `contained` is false is deliberate**, rather than a wrapper that is
 * inert: an always-on frame would take the containing block on every map embed, including the
 * full-page ones this mode is built for, where the viewport is the honest answer and the frame
 * would collapse to the height of an unsized custom element.
 */
export function MapFrame({ contained, children }: { contained: boolean; children: ReactNode }) {
  if (!contained) return <>{children}</>

  return <ContainedFrame>{children}</ContainedFrame>
}

/**
 * The sentence a host gets when they sized the element in a way `height: 100%` cannot fill.
 *
 * Names the actual fix, because the two rules look interchangeable and are not.
 */
const NO_BOX_MESSAGE =
  `this map embed is inside a <${ELEMENT_NAME}> that reports a size but cannot be filled — the ` +
  'widget lays itself out with `height: 100%`, which needs the element to have a definite ' +
  'height, and `min-height` on its own does not give it one (nor does `display: inline-block` ' +
  'for the width). The map is falling back to filling the browser window. Use `height`, a grid ' +
  'or flex track, or `aspect-ratio` to keep it inside your box.'

/**
 * Split from `MapFrame` so the uncontained path runs no hooks at all — a single component
 * could not early-return before them, and would have to guard the adoption on `contained` and
 * turn the children gate into a two-way condition. More code, and one more expressible state.
 */
function ContainedFrame({ children }: { children: ReactNode }) {
  const { node, adopt: adoptFrame } = useFrame<HTMLDivElement>()
  const [unfillable, setUnfillable] = useState(false)

  /**
   * ⚠ **Verify the box before containing anything in it, because the measurement that chose
   * containment cannot see this.** `mapMode` reads the element's RECT, and a rect is non-zero
   * for `min-height: 640px` — while `height: 100%` against that same element resolves to `auto`,
   * because percentage heights resolve against the parent's computed `height`, not its used one.
   * The frame then computes to 0px, and since it carries `contain: layout` the whole fixed layer
   * resolves against a zero-height containing block: the map, the drawers and the cog all vanish,
   * with the readiness marker still attesting a healthy embed.
   *
   * That is also a REGRESSION if left unhandled, which is what makes reporting insufficient on
   * its own: before #169 the very same page rendered the compact card — a working button and the
   * right advice. So an unfillable box is refused outright and the embed falls back to the
   * viewport map it would have had, with one line saying which rule to change.
   *
   * The check runs in the callback ref, during the layout phase: the div is in the DOM with its
   * final box for that pass, `offsetHeight` forces the flush that makes the read correct, and the
   * children are still gated on `node` — so nothing has rendered inside the broken frame yet.
   */
  const adopt = useCallback(
    (element: HTMLDivElement | null) => {
      if (element && (element.offsetHeight === 0 || element.offsetWidth === 0)) {
        reportIntegrationWarning(NO_BOX_MESSAGE)
        setUnfillable(true)
        adoptFrame(null)

        return
      }

      adoptFrame(element)
    },
    [adoptFrame],
  )

  // Refused: render exactly what an unsized map embed renders, resolving against the viewport.
  if (unfillable) return <>{children}</>

  return (
    // `h-full` resolves against `<sahaj-atlas>` — the theme root between us is
    // `display: contents` and generates no box — so the host's own height is what the widget
    // fills, exactly as in `map=false`. `overflow-hidden` is the promise kept: nothing the
    // interface renders paints outside the box they gave us.
    <div ref={adopt} className="h-full w-full overflow-hidden [contain:layout]" data-sy-frame="">
      {/* Held back until `adopt` has published this node, so the first drawer portals inside
          the frame rather than beside it. `useFrame` carries the argument. */}
      {node && children}
    </div>
  )
}
