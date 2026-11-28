import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { FilterNotice } from './FilterNotice'

import { DEFAULT_FILTERS } from '@/lib/shape'

export default { title: 'Organisms' } satisfies StoryDefault

/**
 * FilterNotice — what every list of classes says about its filters. Where they emptied the list,
 * one line and the ways out as links: the one removal that brings the most classes back, where a
 * single one does, then Clear filters. Where they hide some of the area's in-person classes, one
 * line after the list. Clear keeps the place.
 *
 * The answers below are chosen against the story feed, so each section's counts are real.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Nothing matches, and removing one answer brings classes back: that removal leads."
      title="Nothing matches"
    >
      <FilterNotice
        filters={{ ...DEFAULT_FILTERS, timeOfDay: ['night'], languages: ['hi'] }}
        kind="no-match"
      />
    </StorySection>

    <StorySection
      description="No single removal brings any back, so Clear filters is the way out."
      title="Nothing matches, no single way out"
    >
      <FilterNotice
        filters={{
          ...DEFAULT_FILTERS,
          format: 'online',
          daysOfWeek: [1],
          timeOfDay: ['afternoon'],
          languages: ['it'],
        }}
        kind="no-match"
      />
    </StorySection>

    <StorySection
      description="After a searched place's list, when the filters hide some of its in-person classes."
      title="Filters hide classes"
    >
      <FilterNotice count={4} filters={{ ...DEFAULT_FILTERS, daysOfWeek: [2] }} kind="hidden" />
      <FilterNotice count={1} filters={{ ...DEFAULT_FILTERS, daysOfWeek: [2] }} kind="hidden" />
    </StorySection>
    <div />
  </StoryWrapper>
)

Default.storyName = 'Filter Notice'
