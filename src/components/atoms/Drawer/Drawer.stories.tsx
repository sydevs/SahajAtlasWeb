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
import { useIsWideViewport } from '@/config/responsive'

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
  // the app, DrawerStack instead measures its own box (`useIsWide`).
  const direction = useIsWideViewport() ? 'left' : 'bottom'
  const isBottom = direction === 'bottom'

  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1])
  // A `filled` drawer portals into whatever `container` it is given, and fills
  // it with `absolute inset-0`. Passing `null` sends it to <body>, so it would
  // fill the whole viewport. As DrawerStack does, this hands it the bounding
  // element instead, so it stays inside the box.
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
