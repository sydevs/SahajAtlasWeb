import { SAHAJCLOUD_EVENT } from '../../src/mocks/sahajcloud'
import en from '../../src/config/translations.en.json' with { type: 'json' }

import { atlasRoute, expect, hostPage, test, widget } from './fixtures'

// The calendar is the widget's own (no third-party grid), so this is the one place its views,
// their address and their way back to the list are exercised on a real host page.
test('a place opens its calendar, the Week lists its classes by name, and List goes back', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html', '/gb'))

  // Inline, so the views are in the page's own flow: no sheet holds them.
  const sheet = widget(page)

  await sheet.getByRole('button', { name: en.calendar.title, exact: true }).click()
  await expect.poll(() => atlasRoute(page)).toMatch(/^\/calendar/)
  // The calendar names its place.
  await expect(sheet.getByRole('heading', { name: 'United Kingdom', exact: true })).toBeVisible()

  // The fixture class meets four days out, so this week holds it, under its own name.
  await sheet.getByRole('radio', { name: en.calendar.view_week, exact: true }).click()
  await expect.poll(() => atlasRoute(page)).toContain('view=week')
  await expect(sheet.getByRole('link', { name: new RegExp(SAHAJCLOUD_EVENT.title) })).toBeVisible()

  // List leads back to the place the calendar was opened from, rather than stacking it again.
  await sheet.getByRole('radio', { name: en.calendar.view_list, exact: true }).click()
  await expect.poll(() => atlasRoute(page)).toBe('/gb')
})
