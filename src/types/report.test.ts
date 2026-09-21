import { describe, expect, it } from 'vitest'

import { ReportFormFieldSchema, ReportFormSchema } from './report'

const form = {
  id: 7,
  fields: [{ name: 'message', label: 'What went wrong?', required: true, blockType: 'textarea' }],
  submitButtonLabel: 'Send report',
  confirmationType: 'message',
  confirmationMessage: { root: { children: [] } },
}

describe('ReportFormSchema', () => {
  it('keeps no `recipient` or `client`, even when the response carries them', () => {
    // The widget's read selects neither (`getReportForm`), and SahajCloud locks `recipient`
    // against client reads (SahajCloud#813). This is the third guard: a schema that carried
    // either would hand a manager's name and address to every browser on every host page the
    // moment one of the first two slipped.
    const parsed = ReportFormSchema.parse({
      ...form,
      recipient: { id: 3, name: 'A Manager', email: 'manager@example.org' },
      client: { id: 9 },
    })

    expect(parsed).not.toHaveProperty('recipient')
    expect(parsed).not.toHaveProperty('client')
  })

  it('accepts a confirmation type this build has never heard of', () => {
    // An enum here would fail the whole read, and the report path is what a viewer reaches
    // BECAUSE something already broke. An unknown value simply is not `message`, so our own
    // thank-you copy stands in.
    expect(ReportFormSchema.safeParse({ ...form, confirmationType: 'webhook' }).success).toBe(true)
  })

  it('accepts a form whose blocks this build cannot render', () => {
    // `fields` stays unparsed here on purpose — `renderableFields` narrows it, block by block.
    expect(
      ReportFormSchema.safeParse({ ...form, fields: [{ blockType: 'payment', name: 'fee' }] })
        .success,
    ).toBe(true)
  })
})

describe('ReportFormFieldSchema', () => {
  it('refuses a block type the widget has no control for', () => {
    expect(ReportFormFieldSchema.safeParse({ blockType: 'payment', name: 'fee' }).success).toBe(
      false,
    )
  })

  it('refuses an input with no name, since the name is what the CMS matches an answer on', () => {
    expect(ReportFormFieldSchema.safeParse({ blockType: 'text', label: 'Name' }).success).toBe(
      false,
    )
    expect(ReportFormFieldSchema.safeParse({ blockType: 'text', name: '' }).success).toBe(false)
  })

  it('parses a select with its authored options', () => {
    const parsed = ReportFormFieldSchema.parse({
      blockType: 'select',
      name: 'urgency',
      options: [{ label: 'Today', value: 'today', id: 'abc' }],
    })

    expect(parsed).toMatchObject({ options: [{ label: 'Today', value: 'today' }] })
  })

  it('parses authored prose, which carries no name at all', () => {
    expect(
      ReportFormFieldSchema.safeParse({ blockType: 'message', message: { root: {} } }).success,
    ).toBe(true)
  })
})
