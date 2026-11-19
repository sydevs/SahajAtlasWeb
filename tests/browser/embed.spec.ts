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

  await expect(atlas.getByRole('heading', { name: en.countries.title })).toBeVisible()
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

  // ⚠ **A known defect, kept running.** react-map-gl's `exports-mapbox` starts
  // `import('mapbox-gl')` at module load, and the views share a chunk with it, so a map-less
  // embed downloads the whole library (1.9 MB before compression) and never uses it. `test.fail`
  // turns this red the moment it PASSES, so the fix must delete the annotation, and the scenario
  // becomes a gate.
  test('never fetches the mapbox-gl chunk', async ({ page }) => {
    test.fail(true, 'the views chunk evaluates react-map-gl, which imports mapbox-gl eagerly')

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

// The slot is 300px wide, under the interface's floor, so the widget renders its card instead,
// and a collapsed card must cost the host nothing it has not asked for yet (#161).
test('a slot too small for any layout renders the compact card', async ({ page }) => {
  const requests: string[] = []
  const settled = rendered(page)

  page.on('request', (request) => requests.push(request.url()))
  await page.goto(hostPage('sidebar-map.html'))

  const atlas = widget(page)

  await expect(atlas.getByRole('button', { name: en.compact.open })).toBeVisible()
  await settled
  await expect(atlas.getByRole('dialog')).toHaveCount(0)
  await expect(atlas.getByRole('link', { name: UNITED_KINGDOM })).toHaveCount(0)
  await expect(atlas.locator('canvas')).toHaveCount(0)
  expect(requests.filter((url) => MAPBOX_CHUNK.test(url))).toEqual([])
})

// The page's rules are aimed at every button, div and span, at `!important` and above zero
// specificity. Since #236 the widget renders in a shadow root, which no host selector reaches.
test('hostile host CSS does not restyle the widget', async ({ page }) => {
  await page.goto(hostPage('hostile-css.html'))

  const filters = widget(page).getByRole('button', { name: en.filters.chrome.title })
  const heading = widget(page).getByRole('heading', { name: en.countries.title })

  await expect(filters).toBeVisible()

  // The control: the host's own button wears the page's rules, so they are live on this page.
  const hostButton = page.getByRole('button', { name: 'a host button' })

  await expect(hostButton).toHaveCSS('border-top-style', 'dashed')
  await expect(hostButton).toHaveCSS('background-color', 'rgb(255, 0, 255)')
  await expect(filters).not.toHaveCSS('border-top-style', 'dashed')
  await expect(filters).not.toHaveCSS('background-color', 'rgb(255, 0, 255)')
  // Inherited properties do cross the boundary, from the host's `div` around the element, so
  // this one holds only because the widget's own baseline resets it.
  await expect(heading).toHaveCSS('letter-spacing', 'normal')
})
