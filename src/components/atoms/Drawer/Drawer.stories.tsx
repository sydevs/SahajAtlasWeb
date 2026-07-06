import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from './Drawer'

import { Button } from '@/components/atoms/Button'
import { useBreakpoint } from '@/config/responsive'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const SNAP_POINTS = ['8rem', '0.5', '0.97']

/**
 * Drawer — a vaul-based drawer that portals into the themed widget root. Left
 * fixed-width panel at ≥md, bottom snap-point sheet on mobile (resize to see the
 * crossing). Non-modal, so this background stays interactive; a nested drawer
 * stacks over its parent. The DrawerStack wires these to the URL in the app.
 */
export const Default: Story = () => {
  const { isMd } = useBreakpoint('md')
  const direction = isMd ? 'left' : 'bottom'
  const isBottom = direction === 'bottom'

  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0])

  return (
    <div className="flex h-[32rem] items-center justify-center">
      <Button color="primary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>

      <Drawer
        activeSnapPoint={isBottom ? snap : undefined}
        direction={direction}
        open={open}
        setActiveSnapPoint={isBottom ? setSnap : undefined}
        snapPoints={isBottom ? SNAP_POINTS : undefined}
        onOpenChange={setOpen}
      >
        <DrawerContent ariaLabel="Pune">
          <DrawerHeader>
            <h2 className="text-lg font-semibold">Pune</h2>
          </DrawerHeader>
          <DrawerBody>
            <p className="text-sm text-gray-11">
              A vaul drawer: non-modal (the content behind stays interactive),
              {isBottom ? ' snap-pointed on mobile,' : ' a fixed-width left panel on desktop,'}{' '}
              portaled into the themed widget root.
            </p>
            <div className="mt-3">
              <Button variant="flat" onClick={() => setNested(true)}>
                Open a nested drawer →
              </Button>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex justify-end p-3">
              <DrawerClose>
                <Button variant="flat">Close</Button>
              </DrawerClose>
            </div>
          </DrawerFooter>

          <Drawer nested direction={direction} open={nested} onOpenChange={setNested}>
            <DrawerContent ariaLabel="Weekly meditation">
              <DrawerHeader>
                <h2 className="text-lg font-semibold">Weekly meditation</h2>
              </DrawerHeader>
              <DrawerBody>
                <p className="text-sm text-gray-11">
                  A nested drawer stacked over its parent — how the stack drills from a region into
                  an event.
                </p>
              </DrawerBody>
              <DrawerFooter>
                <div className="flex justify-end p-3">
                  <DrawerClose>
                    <Button variant="flat">Back</Button>
                  </DrawerClose>
                </div>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

Default.storyName = 'Drawer'
