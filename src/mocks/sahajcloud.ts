// SahajCloud's responses as they cross the wire, for the browser lane (`tests/browser/`) and Ladle
// (`.ladle/backend.ts`), which both answer every SahajCloud request from here.
//
// ⚠ **Wire shape, not view-model shape.** The mocks beside this file are what a fetcher RETURNS;
// these are what it PARSES: dates as ISO strings, regions as one flat tree linked by `parent`, the
// feed as a FeatureCollection carrying Payload's pagination members, relationships populated only
// as far as each fetcher's `select` asks, and Payload's own envelopes around all of it. A fixture
// in view-model shape skips the parse the lane exists to exercise. `sahajcloud.test.ts` runs every
// fixture through the real fetchers, against `answerSahajCloud`, so neither can drift from the
// contract the app reads.
import type { RegionNode } from '@/types'

import { mockEvent, mockEventImages, mockEventSlimList } from './events'
import { mockGeojson, mockRegionNodes } from './regions'

import translations from '@/config/translations.en.json' with { type: 'json' }
import { CLIENT_PAGE_LIMIT } from '@/config/api/paginate'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** What a fixture is once it has been through `JSON.stringify` — the only form the wire carries. */
export const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value))

/** Payload stamps every document it serves. One instant, so a fixture never depends on the clock. */
const STAMP = '2026-01-01T00:00:00.000Z'

/** The key `clients/me` recognises. Any other answers as Payload does a stranger: `{ user: null }`. */
export const SAHAJCLOUD_API_KEY = 'browser-lane-key'

// ── The region tree ─────────────────────────────────────────────────────────────

const nodeById = new Map(mockRegionNodes.map((node) => [node.id, node]))

const regionNode = (id: number): RegionNode => {
  const node = nodeById.get(id)

  if (!node) throw new Error(`SahajCloud fixtures: no region ${id} in the tree`)

  return node
}

// `webPath` is the server's: the ancestor slug chain, self included. The mocks spell it per
// story, and the one city they share with the feed still carries the display slug its country
// had before SahajCloud#556 — a path no node in this tree answers to.
const regionPath = (id: number): string => {
  const { parent, slug } = regionNode(id)

  return `${parent == null ? '' : regionPath(parent)}/${slug}`
}

export const regionNodes = mockRegionNodes.map((node) => ({
  ...node,
  webPath: regionPath(node.id),
  webUrl: null,
}))

/** A region as `REGION_POPULATE` selects it onto an event: no route, no parent. */
export const regionRefOf = ({ id, slug, name, level, subtitle }: RegionNode) => ({
  id,
  slug,
  name,
  level,
  subtitle,
})

const regionRef = (id: number) => regionRefOf(regionNode(id))

// ── The feed and the events behind it ───────────────────────────────────────────

const features = mockGeojson.features.map((feature) => ({
  ...feature,
  properties: {
    ...feature.properties,
    region: regionRef(feature.properties.region.id),
    // The canonical route, as the server composes it: the region's chain, then the event's id.
    webPath: `${regionPath(feature.properties.region.id)}/${feature.properties.id}`,
  },
}))

const titles = new Map(mockEventSlimList.map((event) => [event.id, event.title]))

/** The feed carries a title for every class it lists; `mockEvent`'s own covers anything else. */
const title = (id: number) => titles.get(id) ?? mockEvent.title

/** The upload rows `getEventDoc` populates. Relative, the way SahajCloud serves a file it holds. */
const images = mockEventImages.map((image, index) => {
  const filename = `atlas-${index + 1}.png`

  return { id: index + 1, url: `/api/images/file/${filename}`, filename, alt: image.alt }
})

/**
 * One full event document per feed feature, so a prefetch of any card the lane shows has an
 * answer. The detail-only fields come from `mockEvent`; everything the feed also carries comes
 * from the feature, so the panel and the card describe the same class.
 */
const eventDocs: Record<string, Json> = Object.fromEntries(
  features.map(({ properties }) => [
    String(properties.id),
    toJson({
      ...mockEvent,
      ...properties,
      title: title(properties.id),
      address: properties.address ?? null,
      schedule: properties.schedule ?? mockEvent.schedule,
      images,
      webUrl: null,
      // The view-model's own route, which no response carries. `undefined` drops it from the JSON.
      path: undefined,
    }),
  ]),
)

const eventFeature = features.find(({ properties }) => properties.id === mockEvent.id)

if (!eventFeature) throw new Error(`SahajCloud fixtures: no feed feature for event ${mockEvent.id}`)

/** The event every scenario that opens one opens: the located class, under its city. */
export const SAHAJCLOUD_EVENT = {
  id: mockEvent.id,
  title: title(mockEvent.id),
  path: eventFeature.properties.webPath,
}

// ── Payload's envelopes ─────────────────────────────────────────────────────────

/** One page holding every row, which each wholesale read here fits in (`paginate.ts`). */
export const onePage = (totalDocs: number) => ({
  totalDocs,
  limit: CLIENT_PAGE_LIMIT,
  totalPages: 1,
  page: 1,
  pagingCounter: 1,
  hasPrevPage: false,
  hasNextPage: false,
  prevPage: null,
  nextPage: null,
})

export const paginated = (docs: unknown[]) => toJson({ docs, ...onePage(docs.length) })

export const sahajCloud = {
  /** `GET /api/clients/me`. Payload's `me` adds `collection` and `_strategy` to the user row. */
  clientMe: toJson({
    user: {
      id: 1,
      name: 'Browser lane',
      color1: '#1E6C71',
      color2: '#A1C3D7',
      color3: '#e08e79',
      allowedDomains: 'localhost',
      clientId: 'browser-lane',
      region: null,
      canonical: { enabled: false, embed: null },
      collection: 'clients',
      _strategy: 'api-key',
    },
    collection: 'clients',
    strategy: 'api-key',
  }),
  /** `GET /api/globals/sy-atlas-config`. English only, so no second bundle is ever asked for. */
  atlasConfig: toJson({ id: 1, availableLocales: ['en'], reportIssueForm: null }),
  /** `GET /api/globals/sy-atlas-translations` — the committed snapshot IS the English bundle. */
  translations: toJson({
    id: 1,
    _status: 'published',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...translations,
  }),
  /** `GET /api/regions`. */
  regions: paginated(regionNodes),
  /** `GET /api/events/geojson`: pagination rides as foreign members (`EventFeatureCollection`). */
  feed: toJson({ type: 'FeatureCollection', features, ...onePage(features.length) }),
  /** `GET /api/events?select[title]=true`. */
  eventTitles: paginated([...titles].map(([id, title]) => ({ id, title }))),
  /** `GET /api/events/:id`, by id. */
  events: eventDocs,
  /** `POST /api/user-submissions`, accepted: Payload's create envelope, `201 { doc, message }`. */
  submissionCreated: toJson({
    doc: { id: 1, uuid: '00000000-0000-4000-8000-000000000001', createdAt: STAMP },
    message: 'User Submission successfully created.',
  }),
  /** `POST /api/clients/report`. */
  embedReport: toJson({ ok: true, mounts: 1 }),
  /** Payload's body for an unhandled failure: no code, so nothing reads it as a refusal. */
  serverError: toJson({ errors: [{ message: 'Something went wrong.' }] }),
  /** Payload's body for an id or a route it does not have. */
  notFound: toJson({ errors: [{ message: 'The requested resource was not found.' }] }),
}

// ── The router ──────────────────────────────────────────────────────────────────

export type SahajCloudAnswer = { status: number; json: Json }

export type SahajCloudRequest = { method: string; url: URL; authorization?: string | null }

/**
 * SahajCloud's answer to one request, by method and path under `/api`, or `undefined` for a
 * request these fixtures do not model — which the browser lane fails a test for, rather than
 * inventing a reply the app could misread as data. `fixtures` swaps in a bigger set of the same
 * shape, as Ladle's demo atlas does (`sahajcloud-demo.ts`).
 */
export function answerSahajCloud(
  request: SahajCloudRequest,
  fixtures: typeof sahajCloud = sahajCloud,
): SahajCloudAnswer | undefined {
  const { method, url } = request
  const path = url.pathname.replace(/^\/api(?=\/)/, '')
  const ok = (json: Json, status = 200) => ({ status, json })

  if (method === 'GET') {
    if (path === '/clients/me') {
      return request.authorization === `clients API-Key ${SAHAJCLOUD_API_KEY}`
        ? ok(fixtures.clientMe)
        : ok({ user: null })
    }
    if (path === '/globals/sy-atlas-config') return ok(fixtures.atlasConfig)
    if (path === '/globals/sy-atlas-translations') return ok(fixtures.translations)
    if (path === '/regions') return ok(fixtures.regions)
    if (path === '/events/geojson') return ok(fixtures.feed)
    if (path === '/events') return ok(fixtures.eventTitles)

    const id = /^\/events\/(\d+)$/.exec(path)?.[1]

    if (id) return fixtures.events[id] ? ok(fixtures.events[id]) : ok(fixtures.notFound, 404)
  }

  if (method === 'POST') {
    if (path === '/user-submissions') return ok(fixtures.submissionCreated, 201)
    if (path === '/clients/report') return ok(fixtures.embedReport)
  }

  return undefined
}
