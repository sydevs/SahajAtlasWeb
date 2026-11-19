import type z from 'zod'

// The two compile-time pins that hold the hand-kept zod schemas in this directory to the
// synced SahajCloud types in `./payload/` (`pnpm types:cms`).
//
// ⚠ Like every pin against `./payload/`, each compares against a checked-in snapshot, so it
// only fires once the resync has been RUN (#191).

/**
 * A zod shape that names only fields the synced SahajCloud type `T` declares.
 *
 * Most fields here are `.nullish()`, so a field SahajCloud renames or drops still parses, as
 * `undefined` and in silence (#191). `satisfies SahajCloudFields<T>` on the shape makes that
 * rename a type error instead.
 *
 * It pins NAMES, never value types. A schema is often looser than the generated type on
 * purpose, and says why where it is.
 *
 * ⚠ A generated type with an index signature accepts any name, which would make the pin
 * vacuous. It gets a shape no schema satisfies instead.
 */
export type SahajCloudFields<T> = string extends keyof T
  ? { '⚠ This SahajCloud type has an index signature, so it can pin no field name.': never }
  : Partial<Record<keyof T, z.ZodTypeAny>>

/**
 * `Ours`, while it has exactly the members of the synced SahajCloud union `Theirs`.
 *
 * A zod enum refuses a value it does not list, so drift either way fails a whole read at
 * runtime: a member SahajCloud renamed or dropped, and one it added. Both are a type error here.
 *
 * `Mirror` only states the second constraint, which cannot name `Ours` without a circular one.
 */
export type SameAsSahajCloud<Ours extends Theirs, Theirs extends Mirror, Mirror = Ours> = Ours
