import { SAHAJCLOUD_EVENT } from '../../src/mocks/sahajcloud'
import en from '../../src/config/translations.en.json' with { type: 'json' }

import { atlasRoute, copy, expect, hostPage, test, widget } from './fixtures'

// The route lives in `?atlas=` on the HOST's URL, and the drawers are a pure function of it
// (`resolveStack`). Dismissal is history-aware: with in-widget history it goes back the way the
// visitor came, and with none — a deep link — it climbs, never taking the host page back.

/**
 * The drill-down through the SahajCloud fixtures' tree. Cambridgeshire holds one class, so its
 * row opens that class directly, under the place's own address.
 */
const PATH = [
  { link: /United Kingdom/, route: '/gb', title: 'United Kingdom' },
  { link: /^Cambridgeshire \d+$/, route: SAHAJCLOUD_EVENT.path, title: SAHAJCLOUD_EVENT.title },
]

const COUNTRY = PATH[0]

type Scope = ReturnType<typeof widget>

// Back, looked up inside what holds the view: the expanded map's sheet, or the inline column.
const backTo = (scope: Scope, title: string) =>
  scope.getByRole('button', { name: copy(en.common.chrome.back_to, { title }), exact: true })

// Inline, the page heading names the place, and the drawer's own title for it is hidden.
const placeHeading = (scope: Scope, place: string) =>
  scope.getByRole('heading', { name: copy(en.countries.place_title, { place }), exact: true })

// On a class, the page heading names the class in its town, whichever town the fixture is in.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const classHeading = (scope: Scope, title: string) => {
  const [before, after] = copy(en.event.display.title_in_place, { title, place: '\u0000' }).split(
    '\u0000',
  )

  return scope.getByRole('heading', { name: new RegExp(`^${escape(before)}.+${escape(after)}$`) })
}

test('browsing the expanded map moves the URL and the drawers, and Back retraces it', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html'))

  // The drawer stack lives in the expanded map; inline, the same views sit in the page.
  await widget(page).getByRole('button', { name: en.common.map.expand, exact: true }).click()

  const atlas = widget(page).getByRole('dialog', {
    name: en.common.chrome.widget_label,
    exact: true,
  })
  const heading = (title: string) => atlas.getByRole('heading', { name: title, exact: true })

  for (const step of PATH) {
    await atlas.getByRole('link', { name: step.link }).click()
    await expect.poll(() => atlasRoute(page)).toBe(step.route)
    await expect(heading(step.title)).toBeVisible()
  }

  // Back goes BACK rather than up a level, and says where: the country the class was opened
  // from, not the city above it. The forward entry it leaves is the proof, since climbing would
  // have pushed a new entry and left nothing to go forward to.
  await backTo(atlas.getByRole('dialog'), COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(heading(SAHAJCLOUD_EVENT.title)).toHaveCount(0)

  await page.goForward()
  await expect.poll(() => atlasRoute(page)).toBe(SAHAJCLOUD_EVENT.path)
  await expect(heading(SAHAJCLOUD_EVENT.title)).toBeVisible()

  // The browser's Back retraces every step, and the last one leaves the host page as it was.
  await page.goBack()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(heading(COUNTRY.title)).toBeVisible()

  await page.goBack()
  await expect.poll(() => atlasRoute(page)).toBeNull()
  await expect(atlas.getByRole('link', { name: PATH[0].link })).toBeVisible()
})

test('a deep link opens inline onto its class, and Back goes past the places that hold only it', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html', SAHAJCLOUD_EVENT.path))

  const atlas = widget(page)

  // Inline, the page heading names the class in its town.
  await expect(classHeading(atlas, SAHAJCLOUD_EVENT.title)).toBeVisible()
  await expect(atlas.getByRole('dialog')).toHaveCount(0)

  // A deep link has no in-widget history, so `navigate(-1)` here would take the HOST page back
  // to wherever the visitor came from (#89). It climbs instead, past the city and the region,
  // which would only open this class again, to the country.
  await backTo(atlas, COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(placeHeading(atlas, COUNTRY.title)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/__review/full-map.html')
})

test('a link to a place with one class opens it, and Back does not bounce into it', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html', '/gb/cambridgeshire'))

  const atlas = widget(page)

  await expect.poll(() => atlasRoute(page)).toBe(SAHAJCLOUD_EVENT.path)
  await expect(classHeading(atlas, SAHAJCLOUD_EVENT.title)).toBeVisible()

  await backTo(atlas, COUNTRY.title).click()
  await expect.poll(() => atlasRoute(page)).toBe(COUNTRY.route)
  await expect(placeHeading(atlas, COUNTRY.title)).toBeVisible()
})
