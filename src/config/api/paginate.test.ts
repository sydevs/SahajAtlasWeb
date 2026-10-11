import { describe, it, expect, vi } from 'vitest'

import { MAX_PAGE_WALK, readAllPages, walkSort } from '@/config/api/paginate'
import { classifyError } from '@/lib/report'

describe('readAllPages', () => {
  it('reads one page and asks for no second one', async () => {
    const read = vi.fn(async () => ({ rows: ['a', 'b'], totalPages: 1 }))

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

  it('keeps the fan-out narrow instead of bursting the whole range at once', async () => {
    let live = 0
    let peak = 0
    const read = vi.fn(async (page: number) => {
      peak = Math.max(peak, ++live)
      await new Promise((resolve) => setTimeout(resolve, 5))
      live -= 1

      return { rows: [page], totalPages: MAX_PAGE_WALK }
    })

    const rows = await readAllPages('regions', read)

    // Every page still arrives, in order — the window may never drop one.
    expect(rows).toEqual(Array.from({ length: MAX_PAGE_WALK }, (_, index) => index + 1))
    // An embed on somebody else's page competes with the host for its ~6 sockets. One
    // `Promise.all` over pages 2…20 would put 19 reads on the wire in the same millisecond.
    expect(peak).toBeLessThan(MAX_PAGE_WALK - 1)
  })

  it('stops issuing pages once one fails, rather than paying for the whole range', async () => {
    const read = vi.fn(async (page: number) => {
      if (page === 3) throw new Error('boom')

      return { rows: [page], totalPages: MAX_PAGE_WALK }
    })

    await expect(readAllPages('regions', read)).rejects.toThrow('boom')
    expect(read.mock.calls.length).toBeLessThan(MAX_PAGE_WALK)
  })

  it('refuses a response that reports no page count, rather than calling page 1 the whole set', async () => {
    // ⚠ The silent-truncation case: a half-loaded atlas renders with no error at all, so the walk
    // has to be louder than the data. `undefined` is what a missing member hands the loop (#253).
    const read = vi.fn(async () => ({ rows: ['a'], totalPages: undefined as unknown as number }))

    await expect(readAllPages('regions', read)).rejects.toThrow(/no page count/)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('throws a reportable `server` failure past the page cap instead of walking on', async () => {
    const read = vi.fn(async () => ({ rows: ['a'], totalPages: MAX_PAGE_WALK + 1 }))

    // `server` is the kind whose fallback offers a retry and a report button.
    await expect(readAllPages('regions', read).catch(classifyError)).resolves.toBe('server')
    // One read, then the refusal — the cap is checked before any page fans out.
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('walkSort', () => {
  it('terminates every key list with the one unique column', () => {
    expect(walkSort('name')).toEqual(['name', 'id'])
    expect(walkSort()).toEqual(['id'])
    expect(walkSort('level', 'name')).toEqual(['level', 'name', 'id'])
  })
})
