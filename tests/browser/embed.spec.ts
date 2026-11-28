import en from '../../src/config/translations.en.json' with { type: 'json' }

import { MAPBOX_CHUNK, expect, hostPage, rendered, test, widget } from './fixtures'

// How the widget comes up on each kind of host page: the shapes `scripts/serve-embed-review.mjs`
// keeps because each one has produced a bug.

const UNITED_KINGDOM = /United Kingdom/

test('a full-page map embed boots, lists the countries and draws its map', async ({ page }) => {
  const styles: string[] = []

  page.on('request', (request) => {
    if (request.url().startsWith('https://api.mapbox.com/styles/v1/')) styles.push(request.url())
  })
  await page.goto(hostPage('full-map.html'))

  const atlas = widget(page)

  // The panel's own title, beside the dialog's screen-reader name of the same words.
  await expect(
    atlas.getByRole('heading', { name: en.countries.title }).and(atlas.locator(':not(.sr-only)')),
  ).toBeVisible()
  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()

  // The style is the map's first request, so it proves mapbox-gl constructed a map, and the
  // context proves WebGL came up under it rather than the map failing over to an error screen.
  await expect
    .poll(() => styles.length, { message: 'the map asked for its style' })
    .toBeGreaterThan(0)

  const canvas = atlas.locator('canvas.mapboxgl-canvas')

  await expect(canvas).toBeVisible()
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext('webgl2')

      return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0)
    }),
  ).toBe(true)
})

test.describe('a map-less embed', () => {
  test('renders the list and draws no map', async ({ page }) => {
    const requests: string[] = []
    const settled = rendered(page)

    page.on('request', (request) => requests.push(request.url()))
    await page.goto(hostPage('sidebar-mapless.html'))

    const atlas = widget(page)

    await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
    await settled
    await expect(atlas.locator('canvas')).toHaveCount(0)
    // `docs/embedding.md`'s promise for `map=false`: none of the Mapbox origins.
    expect(requests.filter((url) => new URL(url).hostname.endsWith('mapbox.com'))).toEqual([])
  })

  // The 1.9 MB library must not be downloaded by an embed that draws no map. Only the map's first
  // render starts it (`loadMapLib`, #445), so nothing at module scope may import mapbox-gl again
  // — `FullInterface` imports `Map.tsx` whatever `hasMap` says.
  test('never fetches the mapbox-gl chunk', async ({ page }) => {
    const chunks: string[] = []
    const settled = rendered(page)

    page.on('request', (request) => {
      if (MAPBOX_CHUNK.test(request.url())) chunks.push(request.url())
    })
    await page.goto(hostPage('sidebar-mapless.html'))
    await expect(widget(page).getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
    await settled

    expect(chunks).toEqual([])
  })
})

// Every embed opens inline, whatever box its host gave it: the host's 520px height gives way to
// the content's, and the map opens over the page only when asked for.
test('a sized slot opens inline, grows to its content, and expands the map on request', async ({
  page,
}) => {
  await page.goto(hostPage('sidebar-map.html'))

  const atlas = widget(page)

  await expect(atlas.getByRole('heading', { name: en.countries.title, exact: true })).toBeVisible()
  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
  await expect(atlas.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(() => page.locator('sahaj-atlas').evaluate((element) => element.clientHeight))
    .toBeGreaterThan(520)

  await atlas.getByRole('button', { name: en.common.map.expand, exact: true }).click()

  // The panel inside is a dialog too, named for the page, which reads the same; the expanded map
  // holds it, so it comes first.
  const expanded = atlas
    .getByRole('dialog', { name: en.common.chrome.widget_label, exact: true })
    .first()

  await expect(expanded).toBeVisible()
  await expanded.getByRole('button', { name: en.common.map.close, exact: true }).click()
  await expect(expanded).toHaveCount(0)
  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
})

// Too narrow to browse in: the place and the way to a map that fits, and the box on the readiness
// marker, where SahajCloud's verifier reads it.
test('a box too small for the atlas shows its heading and "Expand map" alone', async ({ page }) => {
  await page.goto(hostPage('too-narrow.html'))

  const atlas = widget(page)
  const expand = atlas.getByRole('button', { name: en.common.map.expand, exact: true })

  await expect(atlas.getByRole('heading', { name: en.countries.title, exact: true })).toBeVisible()
  await expect(expand).toBeVisible()
  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(document.documentElement.dataset.sahajAtlasReady ?? '{}').tooSmall,
      ),
    )
    .toEqual({ width: 220, height: expect.any(Number) })

  await expand.click()

  // The panel inside is a dialog too, named for the page, which reads the same; the expanded map
  // holds it, so it comes first.
  const expanded = atlas
    .getByRole('dialog', { name: en.common.chrome.widget_label, exact: true })
    .first()

  await expect(expanded).toBeVisible()
  await expect(expanded.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
})

// A narrow inline column opens the calendar at the near-full stop a phone sheet takes, but it covers
// no map: the inline map keeps its corner, and with it Mapbox's credits.
test('a narrow inline calendar leaves the map its credits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(hostPage('full-map.html', '/calendar'))

  const atlas = widget(page)

  // The view's own switch, not a heading: the loading chrome's "Calendar" heading is gone once the
  // view has arrived, and only then has the column taken its stop.
  await expect(atlas.getByRole('radiogroup', { name: en.calendar.title, exact: true })).toBeVisible(
    {
      timeout: 15_000,
    },
  )
  // The corner, not the credits button: the lane's fixture style credits nobody, so Mapbox draws
  // none. What a tall stop would do is hide the whole corner (`useMapControls().hidden`).
  await expect(atlas.locator('.sy-map-controls')).toHaveCSS('visibility', 'visible')
})

// WeMeditate's own atlas page never scrolls: its shell clips whatever grows past it. So the widget
// keeps the box it was given and scrolls inside it, and its last row stays reachable.
test('a shell that never scrolls keeps the atlas in its box, scrolling inside', async ({
  page,
}) => {
  await page.goto(hostPage('app-shell.html'))

  const atlas = widget(page)

  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector('sahaj-atlas')!

        return host.clientHeight - host.parentElement!.clientHeight
      }),
    )
    .toBe(0)

  const last = atlas.getByRole('link').last()

  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
})

// The page's rules are aimed at every button, div and span, at `!important` and above zero
// specificity. Since #236 the widget renders in a shadow root, which no host selector reaches.
test('hostile host CSS does not restyle the widget', async ({ page }) => {
  await page.goto(hostPage('hostile-css.html'))

  const filters = widget(page).getByRole('button', { name: en.filters.chrome.title })
  // A row's label carries no letter-spacing of its own, so only the baseline can hold it.
  const row = widget(page).getByRole('link', { name: UNITED_KINGDOM })

  await expect(filters).toBeVisible()

  // The control: the host's own button wears the page's rules, so they are live on this page.
  const hostButton = page.getByRole('button', { name: 'a host button' })

  await expect(hostButton).toHaveCSS('border-top-style', 'dashed')
  await expect(hostButton).toHaveCSS('background-color', 'rgb(255, 0, 255)')
  await expect(filters).not.toHaveCSS('border-top-style', 'dashed')
  await expect(filters).not.toHaveCSS('background-color', 'rgb(255, 0, 255)')
  // Inherited properties do cross the boundary, from the host's `div` around the element, so
  // this one holds only because the widget's own baseline resets it.
  await expect(row).toHaveCSS('letter-spacing', 'normal')
  await expect(filters).toHaveCSS('letter-spacing', 'normal')
})
