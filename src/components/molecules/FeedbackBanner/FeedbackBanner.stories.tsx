import type { Story, StoryDefault } from '@ladle/react'

import { MemoryRouter } from 'react-router'

import { StoryWrapper, StorySection } from '../../ladle'

import { FeedbackBanner } from './FeedbackBanner'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * FeedbackBanner — the acknowledgement shown to someone arriving from a post-event feedback
 * email (#164). SahajCloud records their vote and redirects them into the Atlas carrying
 * `?feedback=confirmed` (to the event's own page) or `?feedback=denied` (to the event's region
 * page); this is what greets them there.
 *
 * The two answers deliberately read differently. **Confirmed** is a thank-you with a reason —
 * the reader helped somebody else — tinted primary, ticked, and carrying the one onward rung the
 * event page cannot supply on its own. **Denied** leads with the wasted journey, stays neutral,
 * and stops: one report is not a verdict (the listing only comes down at five denials with a
 * Wilson upper bound below 0.5), so the copy never implies the class was fake or has gone. It
 * also promises nothing about the list underneath it — the fifth denial unpublishes the event, so
 * that region can legitimately be empty.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Primary-tinted and ticked, with the onward rung to the reader's region — the event page below it shows the one class they just confirmed, so the way onward has to be offered explicitly."
      title="Confirmed"
    >
      <MemoryRouter>
        <div className="flex max-w-sm flex-col gap-4">
          <FeedbackBanner answer="confirmed" onwardHref="/gb/london" />
        </div>
      </MemoryRouter>
    </StorySection>

    <StorySection
      description="Neutral and unticked — a tick would read as “yes, it's gone”, which one report has not established. No onward link: the region's own list sits directly below and is the onward step."
      title="Denied"
    >
      <MemoryRouter>
        <div className="flex max-w-sm flex-col gap-4">
          <FeedbackBanner answer="denied" />
        </div>
      </MemoryRouter>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Feedback Banner'
