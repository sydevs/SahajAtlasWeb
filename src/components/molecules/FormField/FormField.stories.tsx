import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'
import { ClipboardList, ExternalLink, MapPin, Monitor } from 'lucide-react'

import { StorySection, StoryWrapper } from '../../ladle'

import { FormField } from './FormField'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Input } from '@/components/atoms/Input'
import { RadioGroup } from '@/components/atoms/RadioGroup'
import { Select, SelectItem } from '@/components/atoms/Select'
import { Textarea } from '@/components/atoms/Textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'

export default { title: 'Molecules' } satisfies StoryDefault

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** The set every form is built from, each control in its field: the "Form atoms" section. */
function FormKit() {
  const [place, setPlace] = useState('offline')
  const [day, setDay] = useState('')
  const [signup, setSignup] = useState('elsewhere')
  const [topic, setTopic] = useState('')

  return (
    <div className="flex max-w-sm flex-col gap-5">
      <FormField htmlFor="kit-text" label="Text — Input">
        {(control) => <Input {...control} defaultValue="Balham Library" />}
      </FormField>
      <FormField htmlFor="kit-long" label="Long text — Textarea">
        {(control) => <Textarea {...control} rows={2} />}
      </FormField>
      <FormField htmlFor="kit-select" label="A list to pick from — Select">
        {(control) => (
          <Select {...control} placeholder="Choose one" value={topic} onValueChange={setTopic}>
            <SelectItem value="wrong">Something is wrong</SelectItem>
            <SelectItem value="idea">An idea</SelectItem>
          </Select>
        )}
      </FormField>
      <FormField as="fieldset" label="One tap, with a hint — RadioGroup cards" name="kit-place">
        {(control) => (
          <RadioGroup
            {...control}
            className="grid grid-cols-2"
            name="kit-place"
            options={[
              { value: 'offline', label: 'In person', hint: 'At a venue', icon: MapPin },
              { value: 'online', label: 'Online', hint: 'Zoom or similar', icon: Monitor },
            ]}
            value={place}
            onChange={setPlace}
          />
        )}
      </FormField>
      <FormField
        required
        as="fieldset"
        error={day ? undefined : 'Choose the day it meets.'}
        label="Short choices — ToggleGroup"
        name="kit-day"
      >
        {(control) => (
          <ToggleGroup
            {...control}
            required
            className="grid grid-cols-7 gap-0.5"
            size="md"
            type="single"
            value={day}
            onValueChange={setDay}
          >
            {DAYS.map((label, index) => (
              <ToggleGroupItem key={index} value={String(index + 1)}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </FormField>
      <FormField as="fieldset" label="Longer choices — RadioGroup" name="kit-signup">
        {(control) => (
          <RadioGroup
            {...control}
            name="kit-signup"
            options={[
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
            ]}
            value={signup}
            onChange={setSignup}
          />
        )}
      </FormField>
      <Checkbox appearance="checkbox">Yes or no — Checkbox</Checkbox>
    </div>
  )
}

/**
 * FormField — label, control, and help or error: the shell every form shares (the registration
 * form, the report-issue form, adding and correcting a class). It owns the required marker, the rule that an error replaces the help text while it shows, and the
 * `aria-describedby` ids. Pass the control as a function to receive its wiring (id, describedby,
 * required, invalid), so no form wires it by hand. A group of controls is a fieldset, named by
 * its legend.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A label over the control, and nothing else." title="Variants">
      <StorySection title="Minimal" variant="subsection">
        <div className="max-w-sm">
          <FormField htmlFor="ff-name" label="Your name">
            {(control) => <Input {...control} />}
          </FormField>
        </div>
      </StorySection>
      <StorySection title="Maximal" variant="subsection">
        <div className="max-w-sm">
          <FormField
            required
            help="We send the joining details here."
            htmlFor="ff-email"
            label="Email address"
          >
            {(control) => <Input {...control} type="email" />}
          </FormField>
        </div>
      </StorySection>
    </StorySection>

    <StorySection
      description="An error replaces the help text while it shows, and announces itself unless the form validates as the visitor types."
      title="States"
    >
      <div className="max-w-sm">
        <FormField
          required
          error="Enter a valid email address."
          help="We send the joining details here."
          htmlFor="ff-invalid"
          label="Email address"
        >
          {(control) => <Input {...control} defaultValue="anna@" type="email" />}
        </FormField>
      </div>
    </StorySection>

    <StorySection
      description="Every control a form uses, each in its field. Every field, and a ToggleGroup at the form size, is 44px tall on a touch screen and 40px with a mouse, whichever form it is in."
      title="Form atoms"
    >
      <FormKit />
    </StorySection>

    <StorySection
      description="A short form, as the report-issue form lays it out."
      inContext={true}
      title="Examples"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <FormField required htmlFor="ff-ex-name" label="Your name">
          {(control) => <Input {...control} defaultValue="Anna" />}
        </FormField>
        <FormField help="Only if you'd like a reply." htmlFor="ff-ex-email" label="Email address">
          {(control) => <Input {...control} type="email" />}
        </FormField>
        <FormField required htmlFor="ff-ex-message" label="What's wrong?">
          {(control) => <Textarea {...control} rows={3} />}
        </FormField>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Form Field'
