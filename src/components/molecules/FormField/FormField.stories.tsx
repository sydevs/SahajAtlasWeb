import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { FormField, fieldDescribedBy } from './FormField'

import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * FormField — label, control, and help or error: the shell the registration, report-issue and
 * add-a-class forms share. It owns the required and optional markers, the rule that an error
 * replaces the help text while it shows, and the `aria-describedby` ids, so the control and its
 * help or error can't be wired apart. The caller passes the same id as `htmlFor` and to
 * `fieldDescribedBy`.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A label over the control, and nothing else." title="Variants">
      <StorySection title="Minimal" variant="subsection">
        <div className="max-w-sm">
          <FormField htmlFor="ff-name" label="Your name">
            <Input id="ff-name" />
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
            <Input
              aria-describedby={fieldDescribedBy({ name: 'ff-email', help: true })}
              id="ff-email"
              type="email"
            />
          </FormField>
        </div>
      </StorySection>
    </StorySection>

    <StorySection
      description="Required adds a star; optional names itself, for a form where everything unmarked is needed."
      title="Markers"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <FormField required htmlFor="ff-required" label="Name">
          <Input required id="ff-required" />
        </FormField>
        <FormField optional htmlFor="ff-optional" label="Phone">
          <Input id="ff-optional" type="tel" />
        </FormField>
      </div>
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
          <Input
            isInvalid
            aria-describedby={fieldDescribedBy({ name: 'ff-invalid', error: true })}
            defaultValue="anna@"
            id="ff-invalid"
            type="email"
          />
        </FormField>
      </div>
    </StorySection>

    <StorySection
      description="A short form, as the report-issue form lays it out."
      inContext={true}
      title="Examples"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <FormField required htmlFor="ff-ex-name" label="Your name">
          <Input required defaultValue="Anna" id="ff-ex-name" />
        </FormField>
        <FormField
          optional
          help="Only if you'd like a reply."
          htmlFor="ff-ex-email"
          label="Email address"
        >
          <Input
            aria-describedby={fieldDescribedBy({ name: 'ff-ex-email', help: true })}
            id="ff-ex-email"
            type="email"
          />
        </FormField>
        <FormField required htmlFor="ff-ex-message" label="What's wrong?">
          <Textarea required id="ff-ex-message" rows={3} />
        </FormField>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Form Field'
