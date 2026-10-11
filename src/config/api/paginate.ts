import { atlasError } from '@/lib/report'

type PageOf<T> = { rows: T[]; totalPages: number }

/**
 * The largest `limit` SahajCloud accepts from an API client, and the largest `page`
 * (`MAX_CLIENT_LIMIT` / `MAX_CLIENT_PAGE`, sydevs/SahajCloud#890). Over either ceiling is a 400,
 * not a truncation. Every walked read asks for the largest page the gate allows: a smaller one
 * only adds round trips, and each page costs its own `COUNT`.
 */
export const CLIENT_PAGE_LIMIT = 2000
export const CLIENT_MAX_PAGE = 10_000

/**
 * How many pages one read may walk. Measured in production on 2026-10-10, each wholesale read
 * fits in one page at `CLIENT_PAGE_LIMIT`: 646 regions, 452 events. This cap is roughly 60× that,
 * so it bounds a server-side paging fault rather than real growth — without it, a `totalPages`
 * that never ends becomes an unbounded fetch loop inside a stranger's page.
 */
export const MAX_PAGE_WALK = 20

/**
 * How many of those pages may be in flight at once.
 *
 * The walk is not speculative, so unlike `createPrefetchIntent` it may never drop a page — but it
 * has the same storm shape, from the same place: an embed on a page nobody here owns. One
 * `Promise.all` over the whole range would be a `MAX_PAGE_WALK`-wide burst, doubled at mount
 * where `warmCaches` walks regions and the feed together. A browser serializes past ~6 sockets
 * per host anyway, so windowing costs almost no latency and stops the walk issuing the rest of
 * its pages after one fails.
 */
const MAX_PAGES_IN_FLIGHT = 4

/**
 * Terminates a walk's sort keys with `id`.
 *
 * ⚠ A `LIMIT`/`OFFSET` walk needs a **total** order, and most sortable fields here are not
 * unique — `regions.name` is a plain required text field. Order by one of those alone and
 * Postgres may place ties differently per page, so the walk silently repeats and drops rows.
 * `id` is the only column that makes any key list total.
 */
export const walkSort = (...keys: string[]): string[] => [...keys, 'id']

const pageCount = (totalPages: number, context: string): number => {
  // ⚠ A response carrying no page count cannot be walked to its end, and a half-loaded atlas
  // renders with no error at all — so refuse rather than read page 1 and call it the whole set.
  if (!Number.isInteger(totalPages) || totalPages < 0) {
    throw atlasError('server', `SahajCloud reported no page count: ${context}`)
  }

  if (totalPages > MAX_PAGE_WALK) {
    throw atlasError(
      'server',
      `SahajCloud reported ${totalPages} pages for ${context}, over the ${MAX_PAGE_WALK}-page cap`,
    )
  }

  return totalPages
}

/**
 * Reads every page of one SahajCloud read and concatenates the rows in page order.
 *
 * `readPage` sends its own `limit` and `walkSort`, and parses its own page through its own zod
 * schema. Parsing per page rather than once over the merged rows keeps a bad row's failure inside
 * the page that carried it.
 *
 * The server already said how many pages there are, so the rest are fetched as a bounded range
 * rather than by following `hasNextPage` one at a time.
 */
export const readAllPages = async <T>(
  context: string,
  readPage: (page: number) => Promise<PageOf<T>>,
): Promise<T[]> => {
  const first = await readPage(1)
  const totalPages = pageCount(first.totalPages, context)

  if (totalPages <= 1) return first.rows

  const rows = [...first.rows]

  for (let page = 2; page <= totalPages; page += MAX_PAGES_IN_FLIGHT) {
    const last = Math.min(page + MAX_PAGES_IN_FLIGHT - 1, totalPages)
    const window = await Promise.all(
      Array.from({ length: last - page + 1 }, (_, index) => readPage(page + index)),
    )

    for (const read of window) rows.push(...read.rows)
  }

  return rows
}
