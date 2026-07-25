import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventChips } from './EventChips'

import { mockEvent, mockEventSlimOnline, mockEventToday } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// Samples that exercise each chip + the compact trimming (assuming an `en` UI):
// a plain weekly English class (compact hides both), a daily French online class,
// a multi-language event (languages fold into one chip), and a class on today.
const SAMPLES: { name: string; event: Event & { languages: string[] } }[] = [
  { name: 'Weekly class · English', event: mockEvent },
  { name: 'Daily online · French', event: mockEventSlimOnline as unknown as Event },
  { name: 'Multi-language', event: { ...mockEvent, languages: ['en', 'fr', 'de'] } },
  { name: 'Today', event: mockEventToday },
]

// Each sample on its own line: the name, then the chip row beneath it, so a
// variant's output for a given event reads as a single unit.
const Samples = ({ variant }: { variant: 'default' | 'compact' }) => (
  <div className="flex flex-col gap-4">
    {SAMPLES.map(({ name, event }) => (
      <div key={name} className="flex flex-col gap-1">
        <span className="text-xs text-gray-11">{name}</span>
        <EventChips event={event} variant={variant} />
      </div>
    ))}
  </div>
)

/**
 * EventChips — the shared triage chips (type · language(s) · Today). `default`
 * (event header) names the type and every language; `compact` (list card) drops
 * the plain weekly-class type and the viewer's own language.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The event header names the type and folds every language into one chip."
      title="Default"
    >
      <Samples variant="default" />
    </StorySection>

    <StorySection
      description="The list card drops the plain weekly-class type and the viewer's own language (viewer language = en)."
      title="Compact"
    >
      <Samples variant="compact" />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Chips'
