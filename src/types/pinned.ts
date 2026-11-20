import type z from 'zod'

/**
 * A zod shape that names only fields the synced SahajCloud type `T` declares.
 *
 * It is `satisfies` over `Partial<Record<keyof T, …>>`, named once rather than retyped at the
 * sixteen shapes that carry it.
 *
 * ⚠ **zod's own `satisfies z.ZodType<T>` cannot stand in here**, and neither can
 * `z.ZodType<Partial<T>>`. The first pins the whole output type, which every shape here fails by
 * design: each is the subset a `select` asks for. The second admits the subset but admits an
 * undeclared field name too, which is the one thing this pin is for.
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
