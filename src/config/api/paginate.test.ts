import { describe, it, expect, vi } from 'vitest'

import {
  CLIENT_MAX_PAGE,
  CLIENT_PAGE_LIMIT,
  MAX_PAGE_WALK,
  readAllPages,
} from '@/config/api/paginate'
import { classifyError } from '@/lib/report'

// This stands in for a SahajCloud read: one array of pages, served by page number.
const backend = (pages: string[][]) =>
  vi.fn(async (page: number) => ({ rows: pages[page - 1] ?? [], totalPages: pages.length }))

describe('readAllPages', () => {
  it('reads one page and asks for no second one', async () => {
    const read = backend([['a', 'b']])

    expect(await readAllPages('regions', read)).toEqual(['a', 'b'])
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(1)
  })

  it('follows `totalPages` to the end and concatenates in page order', async () => {
    // The later pages resolve first, so an implementation that concatenated by settle order
    // instead of by page would come back shuffled here.
    const read = vi.fn(async (page: number) => {
      await new Promise((resolve) => setTimeout(resolve, (4 - page) * 5))

      return { rows: [`p${page}a`, `p${page}b`], totalPages: 3 }
    })

    expect(await readAllPages('regions', read)).toEqual(['p1a', 'p1b', 'p2a', 'p2b', 'p3a', 'p3b'])
    expect(read.mock.calls.map(([page]) => page)).toEqual([1, 2, 3])
  })

  it('treats a page count of 0 as the empty read it is', async () => {
    const read = vi.fn(async () => ({ rows: [] as string[], totalPages: 0 }))

    expect(await readAllPages('regions', read)).toEqual([])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('refuses a response that reports no page count, rather than calling page 1 the whole set', async () => {
    // ⚠ This is the silent-truncation case: a half-loaded atlas renders with no error at all, so
    // the walk has to be louder than the data. `undefined` is what a response missing the member
    // hands the loop — which is what every mock in this repo did before #253.
    const read = vi.fn(async () => ({ rows: ['a'], totalPages: undefined as unknown as number }))

    await expect(readAllPages('regions', read)).rejects.toThrow(/no page count/)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('throws a reportable `server` failure past the page cap instead of walking on', async () => {
    const read = vi.fn(async () => ({ rows: ['a'], totalPages: MAX_PAGE_WALK + 1 }))

    // A `server` failure is the kind whose fallback offers a retry and a report button. A walk
    // that just kept going would be an unbounded fetch loop inside somebody else's page.
    await expect(readAllPages('regions', read).catch(classifyError)).resolves.toBe('server')
    // One read, then the refusal — the cap is checked before any page fans out.
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('never lets a walk reach a `page` SahajCloud would refuse', () => {
    // Both bounds are SahajCloud's (`MAX_CLIENT_LIMIT` / `MAX_CLIENT_PAGE`, sydevs/SahajCloud#890),
    // and either one over its ceiling is a 400. This pins the cap so raising it stays a decision.
    expect(MAX_PAGE_WALK).toBeLessThanOrEqual(CLIENT_MAX_PAGE)
    expect(CLIENT_PAGE_LIMIT).toBe(2000)
    expect(CLIENT_MAX_PAGE).toBe(10_000)
  })
})
