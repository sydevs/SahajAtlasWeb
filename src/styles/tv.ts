import { twMerge } from 'tailwind-merge'
import { createTV } from 'tailwind-variants/lite'

/**
 * The `tv()` every recipe is built with: tailwind-variants' lite runtime, merging through
 * tailwind-merge.
 *
 * ⚠ Never import `tv` from `tailwind-variants` itself. That entry bundles a second merge engine
 * with compiled tables, which cost both eager graphs 2.7 KiB gzipped more than this pairing at
 * 4.0.2.
 */
export const tv = createTV({ twMerge })

export type { VariantProps } from 'tailwind-variants/lite'
