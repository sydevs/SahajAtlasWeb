import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from './Drawer'

import { Button } from '@/components/atoms/Button'
import { WIDE_MIN_PX, useIsWide, useIsWideViewport } from '@/config/responsive'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const SNAP_POINTS = ['96px', '300px', 0.97]

/**
 * Drawer — a vaul-based drawer that portals into the themed widget root. Left
 * fixed-width panel at ≥md, bottom snap-point sheet on mobile (resize to see the
 * crossing). Non-modal, so this background stays interactive. In the app,
 * DrawerStack renders a single drawer wired to the URL and simulates the parent
 * drawers as static peek cards behind it (rather than real nested drawers).
 */
export const Default: Story = () => {
  // The story is the whole page, so the viewport IS this drawer's container — unlike the
  // app, where DrawerStack measures its own box (`useIsWide`). See ContainerWidth below
  // for the story that exercises the measured path.
  const direction = useIsWideViewport() ? 'left' : 'bottom'
  const isBottom = direction === 'bottom'

  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1])
  // A `filled` drawer portals into whatever `container` it's given and fills it
  // with `absolute inset-0`. Passing `null` sends it to <body>, so it would fill
  // the whole viewport — as DrawerStack does, hand it the bounding element so it
  // stays inside the box.
  const [filledBox, setFilledBox] = useState<HTMLDivElement | null>(null)

  return (
    <StoryWrapper>
      <StorySection
        description="Opens as a fixed left panel at ≥md and a snap-point bottom sheet below — resize to see the crossing. Non-modal, so this page stays interactive behind it."
        title="Anchored"
      >
        <div className="flex h-64 items-center justify-center">
          <Button color="primary" onClick={() => setOpen(true)}>
            Open drawer
          </Button>
        </div>
      </StorySection>

      <StorySection
        description='`mode="filled"` is the map-less layout: absolute inside its container rather than fixed to the viewport, filling it, with no drag handle. This is what the widget renders when `map={false}`.'
        title="Filled (map-less)"
      >
        <div
          ref={setFilledBox}
          className="relative h-64 w-full overflow-hidden rounded-lg border border-divider"
        >
          <Drawer container={filledBox} direction="bottom" mode="filled" open={true}>
            <DrawerContent aria-label="Filled panel">
              <DrawerHeader>
                <h2 className="text-lg font-semibold">Contained</h2>
              </DrawerHeader>
              <DrawerBody>
                <p className="p-4 text-sm text-gray-11">
                  Fills its container instead of anchoring to a viewport edge.
                </p>
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        </div>
      </StorySection>

      <Drawer
        activeSnapPoint={isBottom ? snap : undefined}
        direction={direction}
        open={open}
        setActiveSnapPoint={isBottom ? setSnap : undefined}
        snapPoints={isBottom ? SNAP_POINTS : undefined}
        onOpenChange={setOpen}
      >
        <DrawerContent aria-label="Pune">
          <DrawerHeader>
            <h2 className="text-lg font-semibold">Pune</h2>
          </DrawerHeader>
          <DrawerBody>
            <p className="text-sm text-gray-11">
              A vaul drawer: non-modal (the content behind stays interactive),
              {isBottom ? ' snap-pointed on mobile,' : ' a fixed-width left panel on desktop,'}{' '}
              portaled into the themed widget root.
            </p>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex justify-end p-3">
              <DrawerClose>
                <Button variant="flat">Close</Button>
              </DrawerClose>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Drawer'

/**
 * One box, measured. `useIsWide` observes the element it is handed, so this panel picks its
 * own interaction model from its own width — the drag handle appears below the crossing and
 * goes away above it, exactly as the app's bottom sheet and left panel do.
 *
 * The right-hand box is resizable (drag its bottom-right corner): crossing 768px flips the
 * model, and holding the pointer near the crossing shows the damping — the switch commits
 * only once the width has held, because vaul's `direction` is not hot-swappable and the
 * drawer remounts on the change.
 */
function MeasuredPanel({
  label,
  resizable = false,
  width,
}: {
  label: string
  resizable?: boolean
  width: number
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const isWide = useIsWide(box)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-gray-11">
        <span className="font-medium">{label}</span> → {isWide ? 'left panel' : 'bottom sheet'}
      </p>
      <div
        ref={setBox}
        className="relative h-64 overflow-hidden rounded-lg border border-divider"
        style={{ maxWidth: '100%', resize: resizable ? 'horizontal' : 'none', width }}
      >
        {/* Keyed on the direction exactly as DrawerStack keys its own drawer: vaul's
            `direction` is not hot-swappable, so the crossing has to REMOUNT the root. Without
            this the story would demonstrate something the app deliberately never does, and
            could strand a stale direction's transform after a resize. */}
        <Drawer
          key={isWide ? 'left' : 'bottom'}
          container={box}
          direction={isWide ? 'left' : 'bottom'}
          mode="filled"
          open={true}
        >
          {/* `filled` hides the handle by default (there is nothing to drag a filled panel
              to), so it is forced here to stand in for the affordance the real bottom sheet
              carries — the visible half of what the direction decides. */}
          <DrawerContent aria-label={label} handle={!isWide}>
            <DrawerHeader>
              <h2 className="text-lg font-semibold">{isWide ? 'Panel' : 'Sheet'}</h2>
            </DrawerHeader>
            <DrawerBody>
              <p className="p-4 text-sm text-gray-11">
                {isWide
                  ? 'Wide enough for the anchored panel: no handle, dismissed by its close button.'
                  : 'Narrow: the sheet model, with a drag handle and swipe-to-dismiss.'}
              </p>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  )
}

/**
 * Container-aware responsiveness (issue #107). Both panels are on the same page, at the same
 * viewport, and they disagree — because the question each one asks is "how wide am *I*",
 * not "how wide is the screen". This is the case the widget used to get wrong: a narrow
 * column embed on a desktop viewport was handed the desktop interaction model.
 */
export const ContainerWidth: Story = () => (
  <StoryWrapper>
    <StorySection
      description={`Same viewport, two models. The left box is 320px — a WordPress sidebar embed — and gets the sheet; the right box is past the ${WIDE_MIN_PX}px crossing and gets the panel. Drag the right box's corner to cross it live.`}
      title="Container-derived direction"
    >
      <div className="flex flex-wrap items-start gap-6">
        <MeasuredPanel label="320px column" width={320} />
        <MeasuredPanel resizable label="820px slot (resizable)" width={820} />
      </div>
    </StorySection>
  </StoryWrapper>
)

ContainerWidth.storyName = 'Drawer — container width'
