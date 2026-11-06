import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StorySection, StoryWrapper } from '../../ladle'

import { WhatToExpect } from './WhatToExpect'

import { mockEvent, mockEventFull, mockEventMinimal } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

/** A Lexical description of one paragraph, enough to cross or mention what the rule looks for. */
const describedAs = (text: string): Event['description'] => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

const longDescription: Event = {
  ...mockEvent,
  description: describedAs(
    'Each week we begin with a short talk on how meditation works, then sit together in ' +
      'silence for twenty minutes. Chairs and cushions are both available, and there is tea ' +
      'afterwards for anyone who would like to stay and ask questions about the practice.',
  ),
}

const mentionsBeginners: Event = {
  ...mockEvent,
  description: describedAs('Beginners are always welcome.'),
}

/** Says when a case renders nothing, since an empty section would read as broken. */
function Case({ event, hidden }: { event: Event; hidden?: string }) {
  return (
    <div className="max-w-md">
      <WhatToExpect event={event} />
      {hidden && <p className="text-sm text-gray-11">Renders nothing: {hidden}</p>}
    </div>
  )
}

/**
 * WhatToExpect — a short, app-supplied reassurance for newcomers on a class page. It shows only
 * where the host wrote little (under 200 characters) and did not already mention beginners, and
 * only while registration is open: a full class, a course past its first session, or anything
 * ended or by request gets nothing.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The host's description is short, or missing." title="Variants">
      <StorySection title="Short description" variant="subsection">
        <Case event={mockEvent} />
      </StorySection>
      <StorySection title="No description" variant="subsection">
        <Case event={mockEventMinimal} />
      </StorySection>
    </StorySection>

    <StorySection
      description="The cases that hide it. Each prints why, in place of the section."
      title="States"
    >
      <StorySection title="The host wrote enough" variant="subsection">
        <Case event={longDescription} hidden="the description is 200 characters or more." />
      </StorySection>
      <StorySection title="The host mentions beginners" variant="subsection">
        <Case event={mentionsBeginners} hidden="the description already says it." />
      </StorySection>
      <StorySection title="Registration is not open" variant="subsection">
        <Case event={mockEventFull} hidden="the class is full." />
      </StorySection>
    </StorySection>

    <StorySection
      description="Under the host's own words, as the class page shows it."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md">
        <p className="text-base">A free weekly meditation class open to everyone.</p>
        <WhatToExpect event={mockEvent} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'What To Expect'
