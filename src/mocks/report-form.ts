import type { ReportForm } from '@/types/report'

// The authored `contact` form behind "Report an issue" (issue #216), as SahajCloud serves it to
// this widget's own `select`: no `recipient`, no `client`. The block shapes are the form-builder's
// own, checked against the generated `Form` interface in `src/types/payload/payload-types.ts` —
// a fixture inventing a shape would let a story and a spec agree with each other and with nothing
// real.
//
// The two fixtures are the two an operator plausibly authors. `mockReportForm` is the plain one,
// and matches the fields the widget hard-coded before the CMS owned them.

export const mockReportForm: ReportForm = {
  id: 7,
  fields: [
    {
      name: 'message',
      label: 'What went wrong?',
      required: true,
      blockType: 'textarea',
    },
    {
      name: 'email',
      label: 'Email',
      required: false,
      blockType: 'email',
    },
  ],
  submitButtonLabel: 'Send report',
  confirmationType: 'message',
  confirmationMessage: null,
}

/** Every control the widget renders, including a block type it deliberately drops. */
export const mockRichReportForm: ReportForm = {
  id: 8,
  fields: [
    {
      blockType: 'message',
      message: {
        root: {
          type: 'root',
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              children: [
                {
                  type: 'text',
                  version: 1,
                  text: 'We read every report. Tell us what you saw and where.',
                },
              ],
            },
          ],
        },
      },
    },
    { name: 'message', label: 'What went wrong?', required: true, blockType: 'textarea' },
    {
      name: 'urgency',
      label: 'How urgent is this?',
      required: true,
      blockType: 'select',
      options: [
        { label: 'Someone turned up to a class that is not running', value: 'urgent' },
        { label: 'Something is wrong, but nobody is stranded', value: 'normal' },
      ],
    },
    { name: 'email', label: 'Email', required: false, blockType: 'email' },
    { name: 'reply-consent', label: 'You may reply to me', blockType: 'checkbox' },
    { name: 'fee', blockType: 'payment' },
  ],
  submitButtonLabel: 'Send it',
  confirmationType: 'message',
  confirmationMessage: {
    root: {
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: 'Thank you — a volunteer will look.' }],
        },
      ],
    },
  },
}
