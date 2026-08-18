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
  /**
   * What the loader measured about this page, or `null` outside a loader-driven boot.
   *
   * **One observation, not two.** This used to sit beside a `report` field holding the same
   * booleans joined to the page's URL — a second copy of itself, captured on loader idle and
   * carried until the widget mounted, which nothing kept in agreement with this one and which
   * still named the first page after a host SPA navigated away. The mount is now read at the send
   * site (`lib/mount.ts`) and joined to this there, so what a report *is* — an observation plus the
   * page it describes — is stated once, as the request body it becomes.
   */
  observed: EmbedFingerprint | null
}

const embed: EmbedBoot = {
  config: DEFAULT_EMBED_CONFIG,
  observed: null,
}

export default embed
