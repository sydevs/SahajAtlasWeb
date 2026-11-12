import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'
import { ExternalLink, ClipboardList, MapPin, Monitor } from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'

import { RadioGroup, type RadioOption } from './RadioGroup'

export default { title: 'Atoms / Inputs' } satisfies StoryDefault

const options: RadioOption[] = [
  { value: 'a', label: 'This week — Wed, Jul 29' },
  { value: 'b', label: 'Next week — Wed, Aug 5' },
  { value: 'c', label: 'In 2 weeks — Wed, Aug 12' },
  { value: 'd', label: 'In 3 weeks — Wed, Aug 19' },
  { value: 'e', label: 'In 4 weeks — Wed, Aug 26' },
]

const places: RadioOption[] = [
  { value: 'offline', label: 'In person', hint: 'At a venue', icon: MapPin },
  { value: 'online', label: 'Online', hint: 'Zoom or similar', icon: Monitor },
]

const signups: RadioOption[] = [
  {
    value: 'here',
    label: 'On the class’s page',
    hint: 'People fill in a short form there.',
    icon: ClipboardList,
  },
  {
    value: 'elsewhere',
    label: 'On Meetup or another site',
    hint: 'We’ll ask our admins to link the button to your page.',
    icon: ExternalLink,
  },
]

/**
 * RadioGroup — a controlled radio list, rendered as selectable cards. The
 * chosen card is highlighted. `collapseAfter` hides the tail behind a
 * reveal link, so a long list, such as the registration date picker, does
 * not flood the form. Options with an `icon` and a `hint` are choice cards,
 * for a question answered with one tap.
 */
export const Default: Story = () => {
  const [simple, setSimple] = useState('a')
  const [collapsed, setCollapsed] = useState('a')
  const [place, setPlace] = useState('offline')
  const [signup, setSignup] = useState('elsewhere')

  return (
    <StoryWrapper>
      <StorySection
        description="A controlled radio list; the selected card is highlighted."
        title="Radio list"
      >
        <div className="max-w-sm">
          <RadioGroup
            aria-label="Pick one"
            name="simple"
            options={options.slice(0, 3)}
            value={simple}
            onChange={setSimple}
          />
        </div>
      </StorySection>

      <StorySection
        description="`collapseAfter` shows the first N options with a reveal link for the rest."
        title="Collapsible"
      >
        <div className="max-w-sm">
          <RadioGroup
            aria-label="Pick a date"
            collapseAfter={3}
            moreLabel="Show more dates"
            name="collapsed"
            options={options}
            value={collapsed}
            onChange={setCollapsed}
          />
        </div>
      </StorySection>

      <StorySection
        description="`highlight` wraps the list in a primary tint to flag an active/used field."
        title="Highlighted"
      >
        <div className="max-w-sm">
          <RadioGroup
            highlight
            aria-label="Pick one (active)"
            name="highlighted"
            options={options.slice(0, 3)}
            value={simple}
            onChange={setSimple}
          />
        </div>
      </StorySection>

      <StorySection
        description="`isInvalid` danger-borders the unselected cards + sets aria-invalid on the group. Pair with an aria-describedby error message."
        title="Invalid"
      >
        <div className="max-w-sm">
          <RadioGroup
            isInvalid
            aria-describedby="date-error"
            aria-label="Pick one (error)"
            name="invalid"
            options={options.slice(0, 3)}
            value={simple}
            onChange={setSimple}
          />
        </div>
      </StorySection>

      <StorySection
        description="`icon` and `hint` make choice cards: the icon's circle shows the choice, the radio mark is hidden but still the native input. Side by side or stacked, by the caller's layout."
        title="Choice cards"
      >
        <div className="flex max-w-sm flex-col gap-4">
          <RadioGroup
            aria-label="Where does the class take place?"
            className="grid grid-cols-2"
            name="place"
            options={places}
            value={place}
            onChange={setPlace}
          />
          <RadioGroup
            aria-label="How do people sign up?"
            name="signup"
            options={signups}
            value={signup}
            onChange={setSignup}
          />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Radio Group'
