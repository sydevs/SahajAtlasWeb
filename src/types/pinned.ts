import type z from 'zod'

/**
 * A zod shape that names only fields the synced SahajCloud type `T` declares.
 *
 * This is TypeScript's own `satisfies` over `Partial<Record<keyof T, …>>`, named once rather
 * than retyped at the sixteen shapes that carry it.
 *
 * ⚠ **zod's own `satisfies z.ZodType<T>` cannot stand in here**, and neither can
 * `z.ZodType<Partial<T>>`. The first pins the whole output type, which every shape here fails
 * by design: each is the subset a `select` asks for, and most fields are `.nullish()` where
 * SahajCloud declares them required (`firstDate_tz`). The second admits the subset but also
 * admits a field name SahajCloud does not declare, which is the one thing this pin is for —
 * a renamed field otherwise parses as `undefined`, in silence (#191).
 *
 * It pins NAMES, never value types. A schema is often looser than the generated type on
 * purpose, and says why where it is.
 *
 * ⚠ Like every pin against `./payload/`, it compares against a checked-in snapshot, so it
 * only fires once the resync has been RUN (#191).
 *
 * ⚠ A generated type with an index signature accepts any name, which would make the pin
 * vacuous. It gets a shape no schema satisfies instead. No type pinned today has one, and
 * `payload-types.ts` generates them elsewhere in the file.
 */
export type SahajCloudFields<T> = string extends keyof T
  ? { '⚠ This SahajCloud type has an index signature, so it can pin no field name.': never }
  : Partial<Record<keyof T, z.ZodTypeAny>>
