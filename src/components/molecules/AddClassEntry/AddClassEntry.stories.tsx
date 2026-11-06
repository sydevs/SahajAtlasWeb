import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { AddClassEntry } from './AddClassEntry'

import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { mockEventSlimList } from '@/mocks/events'

export default { title: 'Molecules / List' } satisfies StoryDefault

const HINT = 'Run one, or know of one? Our admins check it before it appears.'

/**
 * AddClassEntry — the way into the add-a-class flow, at the foot of a place's list and under an
 * empty one. A real row rather than a footnote: hosts asked how to get listed, and the small grey
 * line under a list did not read as an answer. Anyone can suggest a class; admins check it before
 * it appears.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The row on its own." title="Variants">
      <StorySection title="Anywhere" variant="subsection">
        <div className="max-w-md">
          <AddClassEntry hint={HINT} href="/add" label="Add a class to the map" />
        </div>
      </StorySection>
      <StorySection title="In a place" variant="subsection">
        <div className="max-w-md">
          <AddClassEntry hint={HINT} href="/add" label="Add a class in Cambridge to the map" />
        </div>
      </StorySection>
    </StorySection>

    <StorySection
      description="A long place name wraps rather than pushing the chevron off the row."
      title="Widths"
    >
      <div className="max-w-xs">
        <AddClassEntry
          hint={HINT}
          href="/add"
          label="Add a class in San Cristóbal de La Laguna to the map"
        />
      </div>
    </StorySection>

    <StorySection description="At the foot of a place's list." inContext={true} title="Examples">
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          {mockEventSlimList.map((event) => (
            <EventListItem key={event.id} event={event} />
          ))}
        </List>
        <AddClassEntry hint={HINT} href="/add" label="Add a class in Cambridge to the map" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Add Class Entry'
