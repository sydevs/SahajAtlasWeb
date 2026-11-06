import type { Story, StoryDefault } from '@ladle/react'
import type { LocationProblem } from './LocationHelp'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { LocationHelp } from './LocationHelp'

import { Button } from '@/components/atoms/Button'

export default { title: 'Molecules' } satisfies StoryDefault

/** A button that opens the dialog for one problem, as "Near me" does when it can't locate. */
function Opener({
  problem,
  label,
  withSearch,
}: {
  problem: LocationProblem
  label: string
  withSearch?: boolean
}) {
  const [open, setOpen] = useState<LocationProblem | null>(null)

  return (
    <>
      <Button variant="flat" onClick={() => setOpen(problem)}>
        {label}
      </Button>
      <LocationHelp
        problem={open}
        onClose={() => setOpen(null)}
        onSearchInstead={withSearch ? () => setOpen(null) : undefined}
      />
    </>
  )
}

/**
 * LocationHelp — the dialog that explains why "Near me" didn't work. "Blocked" means the visitor
 * once said no: the browser won't ask again and the button does nothing, so it says how to turn
 * location back on. The steps follow the device (iPhone, Android or a computer), read from the
 * browser; Ladle on a computer shows the computer steps. "Failed" means the browser couldn't find
 * a position just now.
 *
 * Where a town search is on screen, the dialog offers it as the main way on.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Location is turned off for this site. The dialog explains how to turn it back on."
      title="Blocked"
    >
      <StorySection title="Minimal" variant="subsection">
        <Opener label="Open: blocked" problem="blocked" />
      </StorySection>
      <StorySection title="Maximal (with a town search)" variant="subsection">
        <Opener withSearch label="Open: blocked, with search" problem="blocked" />
      </StorySection>
    </StorySection>

    <StorySection
      description="The browser couldn't find a position. No steps, only a way on."
      title="Failed"
    >
      <StorySection title="Minimal" variant="subsection">
        <Opener label="Open: failed" problem="failed" />
      </StorySection>
      <StorySection title="Maximal (with a town search)" variant="subsection">
        <Opener withSearch label="Open: failed, with search" problem="failed" />
      </StorySection>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Location Help'
