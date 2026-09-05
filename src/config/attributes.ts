/**
 * This is how the widget reads a boolean setting, wherever it comes from.
 *
 * This lives in its own module, because it is not about privacy, and never was.
 * `map` is the only caller left, and it is a layout choice.
 * It sat in `config/privacy.ts` while three of the four booleans were privacy opt-outs. Those are gone. See #149.
 * Leaving the last one behind in a file named for privacy would be a filing error that reads as a claim.
 *
 * **The rule: only the exact strings `false` and `0` switch something off.**
 * Anything else, absent, empty, `true`, `no`, `FALSE`, leaves the feature ON.
 * A setting nobody wrote must never silently disable a flow the host relies on.
 * That guarantee is worth more than making `map=no` do the obvious thing.
 * `docs/embedding.md` states the consequence plainly.
 *
 * The loader carries its own copy of this rule, in `src/loader/config.ts`, because it must not import from the widget at runtime.
 * `src/loader/literals.test.ts` pins the two together.
 */
export const attributeEnabled = (value?: string | null): boolean =>
  value !== 'false' && value !== '0'
