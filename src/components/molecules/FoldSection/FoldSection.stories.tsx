import type { Story, StoryDefault } from '@ladle/react'
import type { EventSlim } from '@/types'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { FoldSection } from './FoldSection'

import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { mockEventSlim, mockEventSlimOnline, mockEventVariants } from '@/mocks/events'

export default { title: 'Molecules / List' } satisfies StoryDefault

// In-person classes in other towns: today, starting soon, a course, a course under way.
const inPerson = mockEventVariants.slice(2, 6)

/** Holds its own open state, as the place list does through `useFolds`. */
function Fold({
  title,
  rows,
  initiallyOpen = false,
}: {
  title: string
  rows: EventSlim[]
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)

  return (
    <FoldSection count={rows.length} open={open} title={title} onOpenChange={setOpen}>
      <List>
        {rows.map((event) => (
          <EventListItem key={event.id} event={event} />
        ))}
      </List>
    </FoldSection>
  )
}

/**
 * FoldSection — a titled group of list rows that folds, with its row count beside the title so a
 * visitor can judge the group before opening it. The whole header is one button (Enter and Space
 * work, `aria-expanded` announces the state). The rows mount on the first opening and stay mounted,
 * and the header sticks to the top of the scrolling body while its rows are on screen.
 *
 * A place's list uses it for the groups that matter less than the place itself: classes in other
 * cities, online classes, and classes over a border.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Closed by default. The count sits beside the title, and the chevron turns as it opens."
      title="Variants"
    >
      <StorySection title="Closed" variant="subsection">
        <div className="max-w-md">
          <Fold rows={inPerson} title="Classes in other cities" />
        </div>
      </StorySection>
      <StorySection title="Open" variant="subsection">
        <div className="max-w-md">
          <Fold initiallyOpen rows={inPerson} title="Classes in other cities" />
        </div>
      </StorySection>
    </StorySection>

    <StorySection
      description="A long open group in a scrolling body. Scroll down: the header stays pinned, so the group can be closed from anywhere inside it."
      title="Sticky header"
      variant="scrollable"
    >
      <div className="max-w-md">
        <Fold initiallyOpen rows={mockEventVariants} title="Classes in other cities" />
      </div>
    </StorySection>

    <StorySection
      description="The groups under a place's own classes, in the order a place list shows them."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <EventListItem event={mockEventSlim} />
        </List>
        <Fold rows={inPerson} title="Classes in other cities" />
        <Fold rows={[mockEventSlimOnline]} title="Online classes" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Fold Section'
