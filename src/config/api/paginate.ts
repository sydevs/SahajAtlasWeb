import { atlasError } from '@/lib/report'

/** One page's parsed rows, plus the page count the server reported for the whole read. */
export type PageOf<T> = { rows: T[]; totalPages: number }

/**
 * The largest `limit` SahajCloud accepts from an API client, and the largest `page`
 * (`MAX_CLIENT_LIMIT` / `MAX_CLIENT_PAGE`, sydevs/SahajCloud#890). Either bound is a 400, not a
 * truncation. Every wholesale read asks for the largest page the gate allows — a smaller one only
 * adds round trips, and each page costs an extra `COUNT`.
 */
export const CLIENT_PAGE_LIMIT = 2000
export const CLIENT_MAX_PAGE = 10_000

/**
 * How many pages one read may walk. Measured in production on 2026-10-10, each of the three
 * wholesale reads fits in a single page at `CLIENT_PAGE_LIMIT`: 646 regions, 452 events. This cap
 * is roughly 60× that, so it bounds a server-side paging fault rather than real growth.
 *
 * The walk is capped rather than following the server to wherever it leads, because this code runs
 * inside a page nobody here owns: a `totalPages` that never ends would become an unbounded fetch
 * loop in a stranger's tab. `paginate.test.ts` pins the cap at or under `CLIENT_MAX_PAGE`.
 */
export const MAX_PAGE_WALK = 20

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
 * `readPage` sends its own `limit`, parses its own page through its own zod schema, and hands back
 * the rows plus `totalPages`. Parsing per page rather than once over the merged rows keeps a bad
 * row's failure inside the page that carried it.
 *
 * The remaining pages fan out with `Promise.all` instead of walking `hasNextPage` one at a time:
 * the server already said how many there are, so this is the same request count in one round trip
 * of latency instead of N — and it reads as a bounded range rather than a `while` condition.
 */
export const readAllPages = async <T>(
  context: string,
  readPage: (page: number) => Promise<PageOf<T>>,
): Promise<T[]> => {
  const first = await readPage(1)
  const totalPages = pageCount(first.totalPages, context)

  if (totalPages <= 1) return first.rows

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => readPage(index + 2)),
  )

  return [first.rows, ...rest.map((page) => page.rows)].flat()
}
