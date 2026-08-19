import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { ExpandedSurface } from './ExpandedSurface'

import { Button } from '@/components/atoms/Button'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/**
 * ExpandedSurface — the viewport-covering layer a compact embed grows into (issue #161).
 *
 * Expansion is not a new layout: it is map mode's layout made explicit and reversible. The
 * surface is `fixed; inset: 0` with no chrome beyond its collapse control, which is exactly
 * what map mode already paints — so vaul's window-height arithmetic is *correct* inside it,
 * and the whole drawer stack works without a contained variant.
 *
 * Radix owns the focus trap, focus restore to the opening control, Esc, `aria-modal` and the
 * page's scroll lock. Try all four here: Esc closes, Tab never leaves, and focus lands back
 * on the button you opened it with.
 */
export const Default: Story = () => {
  const [open, setOpen] = useState(false)

  return (
    <StoryWrapper>
      <StorySection
        description="The surface covers the whole Ladle canvas — that is the point of it. Esc or the collapse control in the corner brings you back."
        title="Expanding out of a slot"
      >
        <div className="flex h-48 w-[22rem] max-w-full flex-col justify-center gap-3 rounded-2xl border border-divider p-4">
          <p className="text-sm text-gray-11">
            A slot too small for the full interface. Everything the widget can offer here is a card
            and a way out of it.
          </p>
          <Button color="primary" onClick={() => setOpen(true)}>
            Find a class near you
          </Button>
        </div>

        <ExpandedSurface
          collapseLabel="Close"
          open={open}
          title="Free meditation classes"
          onOpenChange={setOpen}
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-lg font-semibold">The whole interface goes here.</p>
            <p className="max-w-sm text-sm text-gray-11">
              In the app this is the map and the drawer stack. Both are `position: fixed`, and this
              surface is the only reason that is now a state with an exit rather than an accident.
            </p>
          </div>
        </ExpandedSurface>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Expanded Surface'
