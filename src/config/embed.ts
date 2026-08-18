/**
 * The configuration the loader handed us, and what it observed about the host page (#149).
 *
 * A mutable module singleton, mirroring `config/api/auth.ts` and
 * `config/preview.ts` — page-global boot state, read where it is needed rather than threaded
 * through component signatures. It is not a `WidgetMode` axis for the same reason live preview
 * is not one: this is *boot session-state*, decided once before React exists, not a runtime mode
 * the tree branches on.
 *
 * **Why a singleton rather than props on the element.** Configuration used to arrive as HTML
 * attributes, which r2wc turned into React props. It now arrives on the loader's script URL, so
 * there is nothing for the element to observe — the values are known before the element is even
 * created. Passing them through attributes purely to read them back out would reintroduce the
 * attribute surface this change exists to remove, and would put them back within reach of a host
 * sanitizer.
 *
 * One widget runs per page (`Widget.tsx` enforces it), which is what makes a singleton the
 * honest shape rather than a shortcut.
 */
import type { LoaderConfig } from '@/loader/config'
import type { EmbedFingerprint } from '@/loader/detect'
import type { EmbedReport } from '@/loader/report'

/**
 * The default the widget renders under when nothing booted it — the standalone dev entry, and
 * every Ladle story. Deliberately the permissive answer in every field, so a surface that never
 * heard of the loader behaves exactly as it did before it existed.
 */
export const DEFAULT_EMBED_CONFIG: LoaderConfig = {
  key: null,
  map: true,
  routing: 'query',
  compact: 'auto',
}

type EmbedBoot = {
  config: LoaderConfig
  /** What the loader measured about this page, or `null` outside a loader-driven boot. */
  observed: EmbedFingerprint | null
  /**
   * The same observation addressed to SahajCloud, or `null` when there is no mount to report — a
   * page whose URL would not parse, and every surface the loader never booted.
   *
   * It waits here rather than being sent by `boot()` because the send must not happen until the
   * widget has genuinely mounted (#153): a report filed the moment the bundle arrives attests to
   * nothing, and the marker it is paired with would be worse than nothing.
   */
  report: EmbedReport | null
}

const embed: EmbedBoot = {
  config: DEFAULT_EMBED_CONFIG,
  observed: null,
  report: null,
}

export default embed
