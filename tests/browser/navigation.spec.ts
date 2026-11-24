import { WIRE_EVENT } from '../../src/mocks/sahajcloud'
import en from '../../src/config/translations.en.json' with { type: 'json' }

import { atlasRoute, copy, expect, hostPage, test, widget } from './fixtures'

// The route lives in `?atlas=` on the HOST's URL, and the drawers are a pure function of it
// (`resolveStack`). Dismissal is history-aware: with in-widget history it goes back the way the
// visitor came, and with none — a deep link — it climbs, never taking the host page back.

/** The drill-down through the SahajCloud fixtures' tree, from the country list to the class. */
const PATH = [
  { link: /United Kingdom/, route: '/gb', title: 'United Kingdom' },
  { link: /^Cambridgeshire \d+$/, route: '/gb/cambridgeshire', title: 'Cambridgeshire' },
  { link: /^Cambridge \d+$/, route: '/gb/cambridgeshire/cambridge', title: 'Cambridge' },
  { link: WIRE_EVENT.title, route: WIRE_EVENT.path, title: WIRE_EVENT.title },
]

const CITY = PATH[2]

test('browsing in moves the URL and the drawers, and Back retraces it', async ({ page }) => {
  await page.goto(hostPage('full-map.html'))

  const atlas = widget(page)
  const heading = (title: string) => atlas.getByRole('heading', { name: title, exact: true })
  // An ancestor drawer stays open behind the top one, as a strip that names it.
  const strip = (title: string) =>
    atlas.getByRole('button', { name: copy(en.common.chrome.back_to, { title }), exact: true })

  for (const [index, step] of PATH.entries()) {
    await atlas.getByRole('link', { name: step.link }).click()
    await expect.poll(() => atlasRoute(page)).toBe(step.route)
    await expect(heading(step.title)).toBeVisible()
    for (const ancestor of PATH.slice(0, index)) await expect(strip(ancestor.title)).toBeVisible()
  }

  // Closing the class goes BACK rather than up a level: the forward entry it leaves is the proof,
  // since climbing to the city would have pushed a new entry and left nothing to go forward to.
  await atlas.getByRole('button', { name: en.common.chrome.close, exact: true }).click()
  await expect.poll(() => atlasRoute(page)).toBe(CITY.route)
  await expect(heading(WIRE_EVENT.title)).toHaveCount(0)

  await page.goForward()
  await expect.poll(() => atlasRoute(page)).toBe(WIRE_EVENT.path)
  await expect(heading(WIRE_EVENT.title)).toBeVisible()

  // The browser's Back retraces every step, and the last one leaves the host page as it was.
  for (const step of PATH.slice(0, -1).reverse()) {
    await page.goBack()
    await expect.poll(() => atlasRoute(page)).toBe(step.route)
    await expect(heading(step.title)).toBeVisible()
  }

  await page.goBack()
  await expect.poll(() => atlasRoute(page)).toBeNull()
  await expect(atlas.getByRole('link', { name: PATH[0].link })).toBeVisible()
  await expect(strip(PATH[0].title)).toHaveCount(0)
})

test('a deep link opens straight onto its event, and closing it climbs to its city', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html', WIRE_EVENT.path))

  const atlas = widget(page)

  await expect(atlas.getByRole('heading', { name: WIRE_EVENT.title, exact: true })).toBeVisible()

  // A deep link has no in-widget history, so `navigate(-1)` here would take the HOST page back
  // to wherever the visitor came from (#89). It climbs to the class's city instead.
  await atlas.getByRole('button', { name: en.common.chrome.close, exact: true }).click()
  await expect.poll(() => atlasRoute(page)).toBe(CITY.route)
  await expect(atlas.getByRole('heading', { name: CITY.title, exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/__review/full-map.html')
})
