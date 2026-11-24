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
 * Drawer — a vaul-based drawer that portals into the themed widget root. It
 * shows a left fixed-width panel at ≥md, and a bottom snap-point sheet on
 * mobile. Resize to see the crossing. It is non-modal, so this background
 * stays interactive. In the app, DrawerStack renders a single drawer wired to
 * the URL. It simulates the parent drawers as static peek cards behind it,
 * instead of real nested drawers.
 */
export const Default: Story = () => {
  // The story is the whole page, so the viewport IS this drawer's container. In
  // the app, DrawerStack instead measures its own box (`useIsWide`). See
  // ContainerWidth below for the story that exercises the measured path.
  const direction = useIsWideViewport() ? 'left' : 'bottom'
  const isBottom = direction === 'bottom'

  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1])

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
 * One box, measured. `useIsWide` observes the element it is handed. So this
 * panel picks its own interaction model from its own width. The drag handle
 * appears below the crossing, and goes away above it, exactly as the app's
 * bottom sheet and left panel do.
 *
 * The right-hand box is resizable: drag its bottom-right corner. Crossing
 * 768px flips the model. Holding the pointer near the crossing shows the
 * damping. The switch commits only once the width has held, because vaul's
 * `direction` is not hot-swappable, and the drawer remounts on the change.
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
      {/* A frame, as the expanded map's dialog is: `contain: layout` makes it the containing
          block for the drawer's fixed panel, and `data-sy-frame` sizes the sheet to it rather
          than the window. */}
      <div
        ref={setBox}
        className="relative h-64 overflow-clip rounded-lg border border-divider [contain:layout]"
        data-sy-frame=""
        style={{ maxWidth: '100%', resize: resizable ? 'horizontal' : 'none', width }}
      >
        {/* Keyed on the direction, exactly as DrawerStack keys its own drawer. Vaul's
            `direction` is not hot-swappable, so the crossing has to REMOUNT the root.
            Without this, the story would demonstrate something the app deliberately
            never does, and could strand a stale direction's transform after a resize. */}
        <Drawer
          key={isWide ? 'left' : 'bottom'}
          container={box}
          direction={isWide ? 'left' : 'bottom'}
          measureAgainst={box}
          open={true}
        >
          <DrawerContent aria-label={label}>
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
 * Container-aware responsiveness (issue #107). Both panels sit on the same
 * page, at the same viewport, and they disagree. Each one asks "how wide am
 * *I*", not "how wide is the screen". This is the case the widget used to get
 * wrong: a narrow column embed on a desktop viewport was handed the desktop
 * interaction model.
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
