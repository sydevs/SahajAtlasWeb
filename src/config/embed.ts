/**
 * This holds the configuration the loader handed us, and what it observed about the host page. See #149.
 *
 * This is a mutable module singleton, mirroring `config/api/auth.ts` and `config/preview.ts`.
 * It is page-global boot state, read where it is needed, rather than threaded through component signatures.
 * It is not a `WidgetMode` axis, for the same reason live preview is not one.
 * This is BOOT SESSION-STATE, decided once before React exists, not a runtime mode the tree branches on.
 *
 * **Why a singleton, rather than props on the element?**
 * Configuration used to arrive as HTML attributes, which r2wc turned into React props.
 * It now arrives on the loader's script URL, so there is nothing for the element to observe.
 * The values are known before the element is even created.
 * Passing them through attributes purely to read them back out would reintroduce the attribute surface this change exists to remove.
 * It would also put them back within reach of a host sanitizer.
 *
 * One widget runs per page. `Widget.tsx` enforces this.
 * That is what makes a singleton the honest shape, not a shortcut.
 */
import type { LoaderConfig } from '@/loader/config'
import type { EmbedFingerprint } from '@/loader/detect'

/**
 * This is the default the widget renders under when nothing booted it: the standalone dev entry, and every Ladle story.
 * Every field deliberately holds the permissive answer.
 * So a surface that never heard of the loader behaves exactly as it did before the loader existed.
 */
export const DEFAULT_EMBED_CONFIG: LoaderConfig = {
  key: null,
  map: true,
  routing: 'query',
  routeFromPage: false,
}

type EmbedBoot = {
  config: LoaderConfig
  /**
   * This is what the loader measured about this page, or `null` outside a loader-driven boot.
   *
   * **This is ONE observation, not two.**
   * This field used to sit beside a `report` field holding the same booleans joined to the page's URL.
   * That was a second copy of itself, captured on loader idle and carried until the widget mounted.
   * Nothing kept that copy in agreement with this one, and it still named the first page after a host SPA navigated away.
   * The mount now reads at the send site, `lib/mount.ts`, and joins to this field there.
   * So what a report IS, an observation plus the page it describes, gets stated once, as the request body it becomes.
   */
  observed: EmbedFingerprint | null
}

const embed: EmbedBoot = {
  config: DEFAULT_EMBED_CONFIG,
  observed: null,
}

export default embed
