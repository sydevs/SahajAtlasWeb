import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventChips } from './EventChips'

import { mockEvent, mockEventSlimOnline, mockEventToday } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// Samples that exercise each chip + the concise trimming (assuming an `en` UI):
// a plain weekly English class (concise hides both), a daily French online class,
// a multi-language event (languages fold into one chip), and a class on today.
const SAMPLES: { name: string; event: Event & { languages: string[] } }[] = [
  { name: 'Weekly class · English', event: mockEvent },
  { name: 'Daily online · French', event: mockEventSlimOnline as unknown as Event },
  { name: 'Multi-language', event: { ...mockEvent, languages: ['en', 'fr', 'de'] } },
  { name: 'Today', event: mockEventToday },
]

/**
 * EventChips — the shared triage chips (type · language(s) · Today). `default`
 * (event header) names the type and every language; `concise` (list card) drops
 * the plain weekly-class type and the viewer's own language.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Left: default (event header). Right: concise (list card, viewer language = en)."
      title="Variants"
    >
      <div className="flex flex-col gap-4">
        {SAMPLES.map(({ name, event }) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="text-xs text-gray-11">{name}</span>
            <div className="flex flex-wrap items-start gap-6">
              <EventChips event={event} variant="default" />
              <EventChips event={event} variant="concise" />
            </div>
          </div>
        ))}
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Chips'
