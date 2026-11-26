/**
 * The primitives the rest of the flow shares: the two formats a draft's own date and time
 * fields are written in, and the leaf algebra the patch and the live preview both compare with.
 */

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A blank optional field is `null`, which is how a correction clears a value. */
export const text = (value: string): string | null => value.trim() || null

export const isGroup = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('root' in value)

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Drops absent and `null` leaves, and any group left empty. */
export const compact = <T extends Record<string, unknown>>(patch: T): T =>
  Object.fromEntries(
    Object.entries(patch).flatMap(([key, value]) => {
      if (value === undefined || value === null) return []
      if (isGroup(value)) {
        const inner = compact(value)

        return Object.keys(inner).length > 0 ? [[key, inner]] : []
      }

      return [[key, value]]
    }),
  ) as T
