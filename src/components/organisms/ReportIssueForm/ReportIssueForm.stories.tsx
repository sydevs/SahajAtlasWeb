import type { Story, StoryDefault } from '@ladle/react'
import type { ReportContext } from '@/lib/report'

import { type ReactNode, useState } from 'react'

// This is not in the organisms barrel — only the ReportIssueModal host is.
// Import from the co-located file instead.
import { StoryWrapper, StorySection } from '../../ladle'

import { ReportIssueForm } from './ReportIssueForm'

import { Button } from '@/components/atoms/Button'
import { Modal, ModalContent } from '@/components/atoms/Modal'
import { mockReportForm, mockRichReportForm } from '@/mocks/report-form'

export default { title: 'Organisms' } satisfies StoryDefault

// This is what the ReportIssueModal host would have assembled — the fields
// a viewer never types. It appears here, so the story previews the real
// payload's shape.
const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://sahajayoga.example/find-a-class',
  locale: 'en',
  client: 'Sahaja Yoga UK',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
}

const noop = () => {}

// This is the panel the modal supplies in the app, so the inline sections
// below show the form at the width and on the surface it actually renders
// against.
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-md flex-col overflow-hidden rounded-2xl border border-divider bg-background">
      {children}
    </div>
  )
}

/**
 * ReportIssueForm is the report-issue form, rendered inside the Modal atom
 * (issues #79, #103 and #216). Its questions are AUTHORED: they come from the
 * `contact` form an operator named on `sy-atlas-config.reportIssueForm`, over the
 * auto-attached context the viewer never types, behind a Cloudflare Turnstile
 * challenge.
 *
 * The live sections render a REAL Turnstile widget against Cloudflare's
 * always-passes test site key, so submit becomes enabled once every authored
 * field answers its own rule. Submitting performs a real
 * `POST /api/user-submissions`. Ladle carries no API key, so it comes back
 * refused, and you land on the failure state. That is the honest outcome, and
 * the point of the ticket: the thank-you screen shows only for a stored message.
 */
export const Default: Story = () => {
  const [open, setOpen] = useState(false)

  return (
    <StoryWrapper>
      <StorySection
        description="The live form, on the two fields a plain contact form authors. Submit stays disabled until the message reaches 10 characters AND Turnstile has produced a token."
        title="Default"
      >
        <Panel>
          <ReportIssueForm context={context} form={mockReportForm} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="A richer authored form: prose, a required select, a consent box, and the operator's own submit label. It also carries one block type this build cannot render, which is dropped rather than thrown on."
        title="Authored fields"
      >
        <Panel>
          <ReportIssueForm context={context} form={mockRichReportForm} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="Seeded with a too-short message and a malformed address: each field shows its own inline error, tied to the control with aria-describedby, and submit stays disabled."
        title="Validation errors"
      >
        <Panel>
          <ReportIssueForm
            context={context}
            form={mockReportForm}
            initialValues={{ f0: 'too short', f1: 'not-an-email' }}
            onClose={noop}
          />
        </Panel>
      </StorySection>

      <StorySection
        description="When the challenge can't load, the form says so and leaves Send disabled — there is no token to send. Rare in practice, since a widget that cannot run the challenge at all fails before a viewer reaches this form."
        title="Captcha blocked"
      >
        <Panel>
          <ReportIssueForm
            captchaUnavailable
            context={context}
            form={mockReportForm}
            onClose={noop}
          />
        </Panel>
      </StorySection>

      <StorySection
        description="A send that failed. The message and address stay put so the retry costs nothing to compose, and the challenge has been reset underneath — a solved challenge is single-use, so a retry needs a fresh one."
        title="Send failed"
      >
        <Panel>
          <ReportIssueForm initialFailed context={context} form={mockReportForm} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="After a STORED report — this screen is derived from the mutation's success and nothing else, and it shows the operator's own confirmation copy when they authored one. The modal unmounts its content on close, so reopening always starts on a fresh form with a new challenge."
        title="Thank you"
      >
        <Panel>
          <ReportIssueForm
            initialSubmitted
            context={context}
            form={mockRichReportForm}
            onClose={noop}
          />
        </Panel>
      </StorySection>

      <StorySection
        description="The same form in the real Modal — the chrome, the portal into the themed root, and the Esc / backdrop / × dismissals the app ships."
        title="In the modal"
      >
        <div className="flex h-32 items-center justify-center">
          <Button color="primary" onClick={() => setOpen(true)}>
            Report an issue
          </Button>
        </div>

        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent
            closeLabel="Close"
            description="Tell us what's wrong and we'll pass it on to the team."
            title="Report an issue"
          >
            <ReportIssueForm
              context={context}
              form={mockReportForm}
              onClose={() => setOpen(false)}
            />
          </ModalContent>
        </Modal>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Report Issue Form'
