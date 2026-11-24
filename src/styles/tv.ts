import { extendTailwindMerge } from 'tailwind-merge'
// eslint-disable-next-line no-restricted-imports -- the one sanctioned import of the package
import { createTV, type VariantProps } from 'tailwind-variants/lite'

/**
 * The `tv()` every recipe is built with: tailwind-variants' lite runtime, merging through
 * tailwind-merge.
 *
 * ⚠ Never import `tv` from the package itself; lint refuses every entry of it. The default entry
 * bundles a second merge engine with compiled tables: at 4.0.2 it cost both eager graphs 2.7 KiB
 * gzipped more than this pairing, and about 12 KiB beside it. Bare `lite` merges nothing, so a
 * variant's or caller's `px-6` ships beside the base `px-2` instead of replacing it.
 *
 * `tailwind-merge` is pinned exactly: it decides every recipe's conflicts, and no gate diffs them
 * all across a bump.
 */
/**
 * ⚠ Every spacing token our `@theme` adds beyond the numeric scale is named here. tailwind-merge
 * cannot read the theme, so it takes `px-gutter` for an unknown class and ships it BESIDE a
 * slot's `px-4` instead of replacing it — whichever comes later in the sheet wins.
 */
const twMerge = extendTailwindMerge({ extend: { theme: { spacing: ['gutter'] } } })

export const tv = createTV({ twMerge })

export type { VariantProps }
