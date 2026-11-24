import type { Page } from '@playwright/test'

import { WIRE_EVENT, sahajCloud } from '../../src/mocks/sahajcloud'
import en from '../../src/config/translations.en.json' with { type: 'json' }

import { LANE_API_ORIGIN } from './lane.mjs'
import { expect, hostPage, test, widget } from './fixtures'

// The registration form, end to end: the challenge frame hands it a token, the submit goes to
// SahajCloud's intake, and only a resolved request may show the confirmation (#103).
//
// The failure is a server error rather than offline mode, which takes a copy path of its own.

const REGISTER = `${WIRE_EVENT.path}/register`

/** Fills the form and submits it once the challenge has handed over its token. */
async function register(page: Page) {
  const atlas = widget(page)
  const submit = atlas.getByRole('button', { name: en.registration.form.submit, exact: true })

  await atlas.getByRole('textbox', { name: en.registration.form.name }).fill('Ada Lovelace')
  await atlas.getByRole('textbox', { name: en.registration.form.email }).fill('ada@example.org')
  // Disabled until the challenge frame posts a token, which is the handshake under test.
  await expect(submit).toBeEnabled()

  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().startsWith(`${LANE_API_ORIGIN}/api/user-submissions`),
  )

  await submit.click()

  return sent
}

test('a registration SahajCloud accepts shows the confirmation', async ({ page }) => {
  await page.goto(hostPage('sidebar-mapless.html', REGISTER))

  const request = await register(page)

  expect(request.postDataJSON()).toMatchObject({
    type: 'registration',
    event: WIRE_EVENT.id,
    senderEmail: 'ada@example.org',
  })
  expect(await request.headerValue('x-turnstile-token')).toMatch(/^browser-lane-token-\d+$/)
  await expect(widget(page).getByText(en.registration.form.followup)).toBeVisible()
})

test('a registration SahajCloud fails shows the failure, not the confirmation', async ({
  page,
  lane,
}) => {
  await lane.answerSahajCloud('/user-submissions', { status: 500, json: sahajCloud.serverError })
  await page.goto(hostPage('sidebar-mapless.html', REGISTER))
  await register(page)

  const alert = widget(page).getByRole('alert')

  await expect(alert).toContainText(en.registration.form.error_title)
  await expect(alert).toContainText(en.registration.form.captcha_retry)
  await expect(widget(page).getByText(en.registration.form.followup)).toHaveCount(0)
})
