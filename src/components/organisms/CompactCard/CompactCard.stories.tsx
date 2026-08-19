import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { CompactCard } from './CompactCard'

import { ExpandedSurface } from '@/components/atoms/ExpandedSurface'
import { COMPACT_MAX_HEIGHT_PX, COMPACT_MAX_WIDTH_PX } from '@/lib/embed-slot'
import { mockEventSlimList } from '@/mocks/events'

export default {
  title: 'Organisms',
} satisfies StoryDefault

// The slot sizes worth looking at. 400×600 is the live reference — `sahajayoga.nl` ships it
// today — and is deliberately ABOVE the thresholds: it is the case that must keep the full
// interface, so it is here to be checked rather than to be styled for.
const SLOTS = {
  'Threshold — the smallest slot that still fits': {
    width: COMPACT_MAX_WIDTH_PX,
    height: COMPACT_MAX_HEIGHT_PX,
  },
  'Sidebar — 300×420': { width: 300, height: 420 },
  'Short — 360×320': { width: 360, height: 320 },
  'Reference — 400×600 (sahajayoga.nl)': { width: 400, height: 600 },
} as const

type SlotKey = keyof typeof SLOTS

/**
 * CompactCard — what the widget shows in a slot too small for the interface (issue #161).
 *
 * The control is named for the TASK ("Find a class near you"), never for the product: that is
 * both the accessible name and the de-branding ratchet (#158). Pressing it expands into the
 * `ExpandedSurface`, which is the real thing rather than a mock — the whole mechanism is
 * here, only the interface inside it is stubbed.
 *
 * The `rows` control is the one to play with at each size: three rows is the budget the
 * thresholds were set against, and it is the first thing that overflows.
 */
export const Default: Story<{ slot: SlotKey; rows: number }> = ({ slot, rows }) => {
  const [open, setOpen] = useState(false)
  const { width, height } = SLOTS[slot]

  return (
    <StoryWrapper>
      <StorySection
        description="The bordered box is the host's slot, at its real pixel size. The card fills it and nothing escapes."
        title="In a host's slot"
      >
        <div
          className="overflow-hidden rounded-lg border border-divider"
          style={{ width, height, maxWidth: '100%' }}
        >
          <CompactCard events={mockEventSlimList.slice(0, rows)} onOpen={() => setOpen(true)} />
        </div>

        <ExpandedSurface
          collapseLabel="Close"
          open={open}
          title="Free meditation classes"
          onOpenChange={setOpen}
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-lg font-semibold">The full interface goes here.</p>
            <p className="max-w-sm text-sm text-gray-11">
              In the app this is the map and the drawer stack — both `position: fixed`, which is why
              the surface is `inset: 0` rather than contained.
            </p>
          </div>
        </ExpandedSurface>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Compact Card'
Default.args = { slot: 'Sidebar — 300×420', rows: 3 }
Default.argTypes = {
  slot: { control: { type: 'select' }, options: Object.keys(SLOTS) },
  rows: { control: { type: 'range', min: 0, max: 3, step: 1 } },
}
