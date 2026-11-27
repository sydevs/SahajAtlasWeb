import type { Page, Route } from '@playwright/test'

import { SAHAJCLOUD_EVENT } from '../../src/mocks/sahajcloud'

import { expect, hostPage, test, widget } from './fixtures'
import { LANE_API_ORIGIN } from './lane.mjs'

/**
 * Holds every SahajCloud read until released, so a spec can measure the loading state — and, for
 * the boot panel, the interface's own code too, so what is on screen is the panel that stands in
 * before it arrives.
 */
async function hold(page: Page, boot: boolean) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const wait = async (route: Route) => {
    await gate
    await route.fallback()
  }

  await page.context().route(`${LANE_API_ORIGIN}/**`, wait)
  if (boot) await page.context().route(/\/assets\/FullInterface-[\w-]+\.js$/, wait)

  return release
}

/**
 * The panel's shape, as geometry: where each band (header, the search band, body) starts and how
 * tall it is, measured from the panel's top, and the first rows of its list, measured from the
 * body's top. A placeholder and the view it stands for should draw the same shape.
 */
const shape = (page: Page) =>
  widget(page).evaluate((host) => {
    const root = host.shadowRoot ?? document
    const visible = (el: Element) => el.getBoundingClientRect().height > 0
    const body = [...root.querySelectorAll('[data-band="body"]')].filter(visible).at(-1)

    if (!body?.parentElement) return null
    // The sheet itself, or the boot panel standing where it opens.
    const panel = (body.closest('[data-vaul-drawer]') ?? body.parentElement).getBoundingClientRect()
    const from = (top: number, el: Element) => {
      const r = el.getBoundingClientRect()

      return { top: Math.round(r.top - top), height: Math.round(r.height) }
    }
    const bands = [...body.parentElement.querySelectorAll(':scope > [data-band]')].map((el) => ({
      band: el.getAttribute('data-band'),
      ...from(panel.top, el),
    }))
    const bodyTop = body.getBoundingClientRect().top
    const rows = [...body.querySelectorAll('li')].filter(visible).slice(0, 2)

    return { bands, rows: rows.map((row) => from(bodyTop, row)) }
  })

type Shape = NonNullable<Awaited<ReturnType<typeof shape>>>

/**
 * A placeholder and the view it stands for must draw the same panel: the same bands, at the same
 * places and heights, and a list that starts where the placeholder rows did, with no placeholder
 * row taller than the row that replaces it (a real row can carry more: chips, a second line).
 */
function expectSameShape(loading: Shape, loaded: Shape, exactRows: boolean) {
  const bands = (s: Shape) => s.bands.map(({ band }) => band)

  expect(bands(loading), 'the same bands, in order').toEqual(bands(loaded))
  loading.bands.forEach((band, index) => {
    expect(Math.abs(band.top - loaded.bands[index].top), `${band.band} top`).toBeLessThanOrEqual(1)
    // The body holds whatever the view lists, and the desktop panel is as tall as its content
    // (#495), so only the bands above it have a height to match; the rows below say the rest.
    if (band.band === 'body') return
    expect(
      Math.abs(band.height - loaded.bands[index].height),
      `${band.band} height`,
    ).toBeLessThanOrEqual(1)
  })
  if (loaded.rows.length === 0) return
  expect(loading.rows.length, 'placeholder rows').toBeGreaterThan(0)
  expect(Math.abs(loading.rows[0].top - loaded.rows[0].top), 'list start').toBeLessThanOrEqual(1)
  loading.rows.forEach((row, index) => {
    const real = loaded.rows[index]

    if (!real) return
    if (exactRows) {
      expect(Math.abs(real.height - row.height), `row ${index} height`).toBeLessThanOrEqual(1)

      return
    }
    expect(row.height, `row ${index} no taller than the real one`).toBeLessThanOrEqual(
      real.height + 1,
    )
    expect(
      real.height - row.height,
      `row ${index} within a line of the real one`,
    ).toBeLessThanOrEqual(32)
  })
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]

// `exactRows` where the fixtures' rows carry nothing a placeholder leaves out: a country's places
// are a name and a count. The first screen opens on the online-classes row, with its line under
// the name, and the fixture classes carry chips.
const ROUTES = [
  { name: 'the first screen', route: undefined, exactRows: false },
  { name: 'a country', route: '/gb', exactRows: true },
  { name: 'search results', route: '/search', exactRows: false },
  { name: 'a class', route: SAHAJCLOUD_EVENT.path, exactRows: false },
  { name: 'the sign-up form', route: `${SAHAJCLOUD_EVENT.path}/register`, exactRows: false },
  { name: 'the filters', route: '/filters', exactRows: false },
  { name: 'the calendar', route: '/calendar', exactRows: false },
]

const STAGES = [
  { stage: 'the boot panel', boot: true },
  { stage: 'the drawer', boot: false },
]

for (const viewport of VIEWPORTS) {
  for (const { stage, boot } of STAGES) {
    for (const { name, route, exactRows } of ROUTES) {
      test(`${name}: ${stage} loads in the shape it arrives in (${viewport.name})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        const release = await hold(page, boot)

        await page.goto(hostPage('full-map.html', route))
        await expect(widget(page).locator('[data-sy-loading]').first()).toBeVisible()
        // The boot panel is no drawer: the interface, vaul and all, has not arrived.
        if (boot) await expect(widget(page).locator('[data-vaul-drawer]')).toHaveCount(0)
        const loading = await shape(page)

        release()
        await expect(widget(page).locator('[data-sy-loading]')).toHaveCount(0)
        // The cross-fade's outgoing layer leaves after 150ms.
        await page.waitForTimeout(400)
        const loaded = await shape(page)

        expect(loading, 'a loading panel').not.toBeNull()
        expect(loaded, 'a loaded panel').not.toBeNull()
        expectSameShape(loading!, loaded!, exactRows)
      })
    }
  }
}
