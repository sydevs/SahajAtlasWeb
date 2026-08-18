/**
 * How the widget reads a boolean setting, wherever it comes from.
 *
 * Lives in its own module because it is not about privacy and never was — `map` is the only
 * caller left, and it is a layout choice. It sat in `config/privacy.ts` while three of the four
 * booleans were privacy opt-outs; those are gone (#149), and leaving the last one behind in a
 * file named for them would be a filing error that reads as a claim.
 *
 * **The rule: only the exact strings `false` and `0` switch something off.** Anything else —
 * absent, empty, `true`, `no`, `FALSE` — leaves the feature **on**. A setting nobody wrote must
 * never silently disable a flow the host relies on, which is worth more than making
 * `map=no` do the obvious thing. `docs/embedding.md` states the consequence plainly.
 *
 * The loader carries its own copy of this rule (`src/loader/config.ts`) because it must not
 * import from the widget at runtime; `src/loader/literals.test.ts` pins the two together.
 */
export const attributeEnabled = (value?: string | null): boolean =>
  value !== 'false' && value !== '0'
