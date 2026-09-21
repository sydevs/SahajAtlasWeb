import { describe, expect, it } from 'vitest'

import { reportFormPending } from './use-report-form'

describe('reportFormPending', () => {
  const state = { configPending: false, formId: 7 as number | null, formPending: false }

  it('waits while the config is still on its way', () => {
    // The config decides whether there is a form at all, so nothing is knowable before it lands.
    expect(reportFormPending({ ...state, configPending: true, formId: null })).toBe(true)
  })

  it('waits while the named form is still being read', () => {
    // The affordance appears with the CONFIG, a round trip ahead of this read. Calling that
    // window a failure tells a viewer something went wrong and then hands them a working form.
    expect(reportFormPending({ ...state, formPending: true })).toBe(true)
  })

  it('settles where this atlas names no form, however the disabled query reports itself', () => {
    // A disabled query stays `pending` forever, so reading it straight would leave the modal
    // waiting on a read that is never going to run, instead of saying the form is unavailable.
    expect(reportFormPending({ configPending: false, formId: null, formPending: true })).toBe(false)
  })

  it('settles once the form has been read', () => {
    expect(reportFormPending(state)).toBe(false)
  })
})
