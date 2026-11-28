import en from '../../src/config/translations.en.json' with { type: 'json' }

import { expect, hostPage, test, widget } from './fixtures'

// The phone sheet's stop is a machine (`views/DrawerStack/sheet-machine.ts`) fed by vaul's own
// snap echo, so only a real vaul in a real browser shows the two agreeing: the header's
// "Show more" follows the sheet's measured top, and Escape walks the same ladder it reads.

test.use({ viewport: { width: 390, height: 844 } })

test('Escape collapses the phone sheet to its peek, and Show more opens it again', async ({
  page,
}) => {
  await page.goto(hostPage('full-map.html'))

  const atlas = widget(page)
  const sheet = atlas.getByRole('dialog')
  const showMore = atlas.getByRole('button', { name: en.common.chrome.show_more, exact: true })

  await expect(sheet.getByRole('link', { name: /United Kingdom/ })).toBeVisible()
  await expect(showMore).toHaveCount(0)

  // With no step back, Escape is the sheet's own collapse.
  await sheet.getByRole('link', { name: /United Kingdom/ }).focus()
  await page.keyboard.press('Escape')

  await expect(sheet).toHaveAttribute('data-sy-peek', '')
  await expect(showMore).toBeVisible()

  // Collapsed, with nowhere left to go: a plain embed has no surface above it, so the sheet
  // stays where it is rather than reopening or closing.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveAttribute('data-sy-peek', '')

  await showMore.click()

  await expect(sheet).not.toHaveAttribute('data-sy-peek', '')
  await expect(showMore).toHaveCount(0)
})
