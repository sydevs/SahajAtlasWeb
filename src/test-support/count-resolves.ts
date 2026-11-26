/**
 * Counts `useEventDisplay` resolves while a spec renders (#505). Each resolve of a recurring class
 * builds exactly one `Intl.ListFormat`, for its weekday list, so a spec renders a recurring sample
 * and reads `count`. ⚠ If the hook ever builds a second one, every count doubles together.
 *
 * A spy on the hook itself loads a second React under `importOriginal`, and one on
 * `resolveEventDisplay` meets a circular import from the mocks, so this counts what they build.
 */
export function countResolves() {
  // `Intl`'s members are typed read-only; the runtime lets a spec swap one and put it back.
  const intl = Intl as { ListFormat: typeof Intl.ListFormat }
  const Original = intl.ListFormat
  const counter = { count: 0, restore: () => void (intl.ListFormat = Original) }

  intl.ListFormat = class extends Original {
    constructor(...args: ConstructorParameters<typeof Original>) {
      super(...args)
      counter.count += 1
    }
  }

  return counter
}
