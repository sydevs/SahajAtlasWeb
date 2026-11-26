import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventChips } from './EventChips'

import {
  mockEvent,
  mockEventFull,
  mockEventFullToday,
  mockEventSlimOnline,
  mockEventToday,
} from '@/mocks/events'
import { useEventDisplay } from '@/hooks/use-event-display'

export default { title: 'Molecules' } satisfies StoryDefault

// These samples exercise each chip and the compact trimming, assuming an
// `en` UI:
// - a plain weekly English class (compact hides both)
// - a daily French online class
// - a multi-language event, where languages fold into one chip
// - a class on today
// - an at-capacity class
// - the precedence case where both would apply
const SAMPLES: { name: string; event: Event & { languages: string[] } }[] = [
  { name: 'Weekly class · English', event: mockEvent },
  { name: 'Daily online · French', event: mockEventSlimOnline as unknown as Event },
  { name: 'Multi-language', event: { ...mockEvent, languages: ['en', 'fr', 'de'] } },
  { name: 'Today', event: mockEventToday },
  { name: 'Full', event: mockEventFull },
  { name: 'Full + today → no Today chip', event: mockEventFullToday },
]

// A caller resolves the strings once and hands them down, as EventListItem does.
const Sample = ({
  event,
  surface,
}: {
  event: (typeof SAMPLES)[number]['event']
  surface: 'page' | 'card'
}) => <EventChips languages={event.languages} strings={useEventDisplay(event)} surface={surface} />

// Each sample sits on its own line: the name, then the chip row beneath
// it. So a surface's output for a given event reads as a single unit.
const Samples = ({ surface }: { surface: 'page' | 'card' }) => (
  <div className="flex flex-col gap-4">
    {SAMPLES.map(({ name, event }) => (
      <div key={name} className="flex flex-col gap-1">
        <span className="text-xs text-gray-11">{name}</span>
        <Sample event={event} surface={surface} />
      </div>
    ))}
  </div>
)

/**
 * EventChips — the shared triage chips (type, language(s), Today).
 * The class page names the type and every language. The list card trims to what
 * is not already on the card: it drops the plain weekly-class type and the
 * viewer's own language, and it is the only surface that carries "Today". A full
 * class carries no Today chip.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The class page names the type and folds every language into one chip."
      title="Page"
    >
      <Samples surface="page" />
    </StorySection>

    <StorySection
      description="The list card drops the plain weekly-class type and the viewer's own language (viewer language = en)."
      title="Card"
    >
      <Samples surface="card" />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Chips'
