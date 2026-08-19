import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { CompactCard } from './CompactCard'

import { ExpandedSurface } from '@/components/atoms/ExpandedSurface'
import { compactFit } from '@/lib/embed-slot'
import { mockEventSlimList } from '@/mocks/events'

export default {
  title: 'Organisms',
} satisfies StoryDefault

// The three shapes a host's slot comes in, plus the live reference. Each one is here because
// it renders differently, not for coverage's sake — `compactFit` decides the row budget from
// the height alone, so the height is what varies.
const SLOTS = {
  'No height — sizes to its content': { width: 300, height: null },
  'Button only — 300×200': { width: 300, height: 200 },
  'Room for rows — 300×420': { width: 300, height: 420 },
  'Short and wide — 900×220': { width: 900, height: 220 },
  'Reference — 400×600 (sahajayoga.nl)': { width: 400, height: 600 },
} as const

type SlotKey = keyof typeof SLOTS

/**
 * CompactCard — what the widget shows in a slot too small for the interface (issue #161).
 *
 * **The button is the irreducible content.** Everything above it is what the box had room for:
 * `compactFit` reads the host's measured height once at mount and hands down a row budget, so
 * a 200px slot gets the button alone and a 420px one gets rows above it. A slot with NO height
 * makes the card size to its own content rather than collapsing on an `h-full` that resolves
 * against nothing.
 *
 * Content is centred on both axes in whatever box the host gave, and capped at `max-w-xs` so a
 * short-but-wide slot reads as a card rather than a full-bleed button.
 *
 * Pressing it expands into the real `ExpandedSurface` — the whole mechanism is here; only the
 * interface inside it is stubbed. The control is named for the TASK, never the product, which
 * is both the accessible name and the de-branding ratchet (#158).
 */
export const Default: Story<{ slot: SlotKey; rows: number }> = ({ slot, rows }) => {
  const [open, setOpen] = useState(false)
  const { width, height } = SLOTS[slot]
  const fit = compactFit(height ?? 0)
  // The story's own control caps the pool; `fit.rows` is what the slot would actually allow,
  // so the smaller of the two is what the app would render here.
  const shown = Math.min(rows, fit.rows)

  return (
    <StoryWrapper>
      <StorySection
        description="The bordered box is the host's slot at its real pixel size. With no height it hugs the card; with one, the content centres inside it."
        title="In a host's slot"
      >
        <p className="text-xs text-gray-11">
          {height === null ? 'no height set' : `${height}px tall`} → fill: {String(fit.fill)}, room
          for {fit.rows} row{fit.rows === 1 ? '' : 's'}
        </p>
        <div
          className="overflow-hidden rounded-lg border border-divider"
          style={{ width, height: height ?? undefined, maxWidth: '100%' }}
        >
          <CompactCard
            events={mockEventSlimList.slice(0, shown)}
            fill={fit.fill}
            onOpen={() => setOpen(true)}
          />
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
Default.args = { slot: 'Room for rows — 300×420', rows: 3 }
Default.argTypes = {
  slot: { control: { type: 'select' }, options: Object.keys(SLOTS) },
  rows: { control: { type: 'range', min: 0, max: 3, step: 1 } },
}
