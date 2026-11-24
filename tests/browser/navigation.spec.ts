import { WIRE_EVENT } from '../../src/mocks/wire'
import en from '../../src/config/translations.en.json' with { type: 'json' }

import { atlasRoute, copy, expect, hostPage, test, widget } from './fixtures'

// The route lives in `?atlas=` on the HOST's URL, and the drawers are a pure function of it
// (`resolveStack`). Dismissal is history-aware: with in-widget history it goes back the way the
// visitor came, and with none — a deep link — it climbs, never taking the host page back.

/**
 * The drill-down through the wire fixtures' tree. Cambridgeshire holds one class, so its row opens
 * that class directly, under the place's own address.
 */
const PATH = [
  { link: /United Kingdom/, route: '/gb', title: 'United Kingdom' },
  { link: /^Cambridgeshire \d+$/, route: WIRE_EVENT.path, title: WIRE_EVENT.title },
]

const COUNTRY = PATH[0]

// Back is the sheet's own button. The peek strips behind it carry the same names, since the
// nearest one goes to the same place, so the lookup stays inside the sheet.
const backTo = (atlas: ReturnType<typeof widget>, title: string) =>
  atlas
    .getByRole('dialog')
    .getByRole('button', { name: copy(en.common.chrome.back_to, { title }), exact: true })

test('browsing in moves the URL and the drawers, and Back retraces it', async ({ page }) => {
  await page.goto(hostPage('full-map.html'))

  const atlas = widget(page)
  const heading = (title: string) => atlas.getByRole('heading', { name: title, exact: true })

  for (const step of PATH) {
    await atlas.getByRole('link', { name: step.link }).click()
    await expect.poll(() => atlasRoute(page)).toBe(step.route)
    await expect(heading(step.title)).toBeVisible()
  }

  // Back goes BACK rather than up a level, and says where: the country the class was opened
  // from, not the city above it. The forward entry it leaves is the proof, since climbing would
  // have pushed a new entry and left nothing to go forward to.
  await backTo(atlas, COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(heading(WIRE_EVENT.title)).toHaveCount(0)

  await page.goForward()
  await expect.poll(() => atlasRoute(page)).toBe(WIRE_EVENT.path)
  await expect(heading(WIRE_EVENT.title)).toBeVisible()

  // The browser's Back retraces every step, and the last one leaves the host page as it was.
  await page.goBack()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(heading(COUNTRY.title)).toBeVisible()

  await page.goBack()
  await expect.poll(() => atlasRoute(page)).toBeNull()
  await expect(atlas.getByRole('link', { name: PATH[0].link })).toBeVisible()
})

test('a deep link to a class goes back past the places that hold only it', async ({ page }) => {
  await page.goto(hostPage('full-map.html', WIRE_EVENT.path))

  const atlas = widget(page)

  await expect(atlas.getByRole('heading', { name: WIRE_EVENT.title, exact: true })).toBeVisible()

  // A deep link has no in-widget history, so `navigate(-1)` here would take the HOST page back
  // to wherever the visitor came from (#89). It climbs instead, past the city and the region,
  // which would only open this class again, to the country.
  await backTo(atlas, COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(atlas.getByRole('heading', { name: COUNTRY.title, exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/__review/full-map.html')
})

test('a link to a place with one class opens it, and Back does not bounce into it', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html', '/gb/cambridgeshire'))

  const atlas = widget(page)

  await expect.poll(() => atlasRoute(page)).toBe(WIRE_EVENT.path)
  await expect(atlas.getByRole('heading', { name: WIRE_EVENT.title, exact: true })).toBeVisible()

  await backTo(atlas, COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(atlas.getByRole('heading', { name: COUNTRY.title, exact: true })).toBeVisible()
})
