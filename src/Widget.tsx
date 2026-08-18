import type { EmbedFingerprint } from './loader/detect'
import type { LoaderConfig } from './loader/config'
import type { EmbedReport } from './loader/report'
import type { MountDecision } from './lib/shape'

import r2wc from '@r2wc/react-to-web-component'
import { useEffect, useRef } from 'react'

import App, { RootBoundary } from './App'
import AtlasRouter from './router'
import atlasAuth from './config/api/auth'
import embed from './config/embed'
import i18n from './config/i18n'
import { useLocale } from './hooks/use-locale'
import { getInitialTheme } from './hooks/use-theme'
import { ELEMENT_NAME } from './lib/element'
import { announceEmbed, releaseAnnouncement } from './lib/embed-announce'
import { reportIntegrationWarning } from './lib/report'
import { SLOT_WARNING_MESSAGE, mapSlotWarning } from './lib/embed-slot'
import { WIDGET_SCOPE_CLASS } from './lib/scope'
import { mountDecision } from './lib/shape'
import { queryClient } from './config/query-client'

// Implementation of the embeddable widget's custom element.
//
// **This bundle is no longer what a host loads.** `auto.js` (`src/loader/`) is the one script in
// the snippet; it parses the configuration off its own URL, creates or adopts the element, waits
// until the element is near the viewport, and only then imports this module and calls `boot`.
// A host therefore pays ~3 KiB up front instead of the whole widget, and nothing here runs on a
// page whose embed is never scrolled to. Demo in: demo.html

/**
 * The custom element's React root. Nothing renders above this, which is why the outermost
 * boundary sits here rather than deeper: from here it also covers <Atlas>'s own render body — the
 * mount decision, the theme read, the i18n read — and the router itself, none of which the
 * boundary inside <App> is structurally able to see.
 */
export default function Widget() {
  return (
    <RootBoundary>
      <Atlas />
    </RootBoundary>
  )
}

function Atlas() {
  // Read once per render from the boot singleton (`config/embed.ts`) rather than from props.
  // Configuration arrives on the loader's script URL, so it is known before this element exists
  // and there is nothing for the element to observe — see that module for why it is not a prop.
  const { config } = embed

  if (!atlasAuth.apiKey) {
    atlasAuth.apiKey = config.key
  }

  // NB: the initial locale is applied by App's AppShell effect (from `defaultLocale` below),
  // which runs once on mount and again only if the host changes it. Don't call
  // i18n.changeLanguage here in the render body — it re-fired on every render and clobbered a
  // language the user picked from the settings menu.

  // Where the widget boots, and whether its route reaches the URL — decided ONCE, on the first
  // render. Guarded to a ref because the widget re-renders reactively (a locale change), and
  // re-deciding would teleport the visitor back to the embed's default route.
  //
  // `query` is the normal case: the route lives in `?atlas=` on the host's own URL, which is a
  // real, indexable, shareable link on their domain. `memory` is a degradation, taken only where
  // the URL cannot be written at all — a sandboxed iframe, a `file://` document — which the loader
  // has already probed. There is no third case: the widget no longer reads or writes the fragment,
  // so a host's `#respond` anchor is simply none of its business (the whole of #92 goes with it).
  //
  // Memory mode still costs the two things it always did, and `linkable` is how the tree asks
  // rather than finding out by handing a viewer a wrong link (#115): the route is not in the URL,
  // and Back leaves the host page. The third cost — in-widget hrefs resolving against the host
  // origin — is fixed everywhere else by `createHref`.
  //
  // Re-entrancy: `useLocale` can suspend on a cold i18n boot, which makes React discard and retry
  // this render. Safe, because this is a pure read of the URL plus the config — it writes nothing.
  const mount = useRef<MountDecision>()

  if (!mount.current) {
    mount.current = mountDecision({
      routing: config.routing,
      search: window.location.search,
      route: config.route,
      urlWritable: embed.observed?.urlWritable,
    })
  }

  // Reported once, from the render that decided it. `routing=path` is accepted and not yet
  // honoured, and saying so is the difference between a host discovering their server config is
  // unused and believing it works.
  const warning = mount.current.warning

  useEffect(() => {
    if (warning) reportIntegrationWarning(warning)
  }, [warning])

  // One name for the one decision: it picks the router below AND is the `linkable` mode axis
  // handed to the tree. Deriving both from the same const is what stops a later reader from
  // answering "is our route in the URL?" a second, divergent way.
  const linkable = mount.current.mode === 'query'
  const hasMap = config.map

  // The widget scopes its theme to this wrapper so it never mutates the host page's <html>. Set
  // the initial light/dark class synchronously to avoid a flash; BrandTheme adopts the wrapper as
  // the theme root + paints the brand palette once mounted. `dir` derives from the ACTIVE locale
  // (reactively) so every descendant — and Tailwind's rtl: variants — follow text direction.
  // It also carries WIDGET_SCOPE_CLASS: every rule in our injected stylesheet is rewritten to sit
  // under that class (issue #91), so without it here the embed renders completely unstyled. Same
  // element as the theme class by necessity — the scoped `dark:` / `rtl:` variants resolve both
  // against one ancestor.
  const themeRootRef = useRef<HTMLDivElement>(null)
  const { locale: activeLocale, t } = useLocale()

  // Attest that the widget booted, and tell SahajCloud what it found (#153).
  //
  // **This waits for a mount, and that is the entire point of the marker.** The verifier loads a
  // host page through Cloudflare Browser Rendering and treats `data-sahaj-atlas-ready` as evidence
  // the embed works, so publishing it on script load — or from `boot()`, before React has committed
  // anything — would attest to a page whose widget may never have rendered. Hence an effect, which
  // runs after the commit, plus the theme-root ref: `AtlasRouter` can render `null`, and a ref set
  // at commit time is the cheapest proof that DOM of ours actually exists.
  //
  // The routing attested is `mount.current.routing`, the shape the router ACTUALLY uses — not
  // `config.routing`, which is the shape somebody asked for. `mountDecision` owns that difference
  // and is where a real path mode will land; a marker carrying a request rather than a finding is
  // worth nothing to the verifier reading it.
  //
  // Everything else — announce-once, the release, the never-throw — belongs to `announceEmbed`,
  // which unlike this file has a spec that can hold it.
  const attested = mount.current.routing

  useEffect(() => {
    if (!themeRootRef.current) return

    void announceEmbed({ routing: attested, observed: embed.observed, report: embed.report })

    // No cleanup pairing with this effect: a marker torn down per re-render would flap. It is
    // released with page-global ownership instead — see `releaseOwnership`.
  }, [attested])

  // Map mode always fills the viewport, whatever slot the host gave us — a REQUIREMENT rather
  // than an oversight, argued in `lib/embed-slot.ts` (vaul's snap sheets are computed off the
  // window height, so containing the map is not a `fixed`→`absolute` swap). Nothing here changes
  // behaviour; it only turns a silent takeover of somebody's page into a named one, through the
  // same channel as the other host-integration mistakes this file reports. Reads the host's own
  // column, not our element: in map mode ours has no box to measure — everything below the
  // `display: contents` root is fixed.
  useEffect(() => {
    if (!hasMap) return

    const element = themeRootRef.current?.parentElement

    if (!element) return

    // Guarded because these are four reads of a DOM we do not own, made purely to produce a
    // console line. A
    // host is free to have patched `getBoundingClientRect` — consent wrappers, anti-fingerprinting
    // extensions and page builders all do — and an unguarded throw here would reach `RootBoundary`
    // AFTER the tree has mounted, tearing the whole widget down and replacing it with the static
    // "could not be loaded" rung. A diagnostic must never break the thing it is diagnosing.
    try {
      const warning = mapSlotWarning({
        slotWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
        elementHeight: element.getBoundingClientRect().height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })

      if (warning) reportIntegrationWarning(SLOT_WARNING_MESSAGE[warning])
    } catch {
      // Nothing to do and nothing worth reporting: the host's own error would be the only
      // payload, and a thrown message is the one field that reaches Sentry unfiltered.
    }
  }, [hasMap])

  const atlas = (
    /* display:contents keeps the wrapper out of the layout while still carrying the theme class +
       brand CSS vars down to every descendant. `lang` tracks the ACTIVE locale alongside `dir`,
       because the host page's <html lang> is almost never the widget's: a French atlas on an
       English site was being announced with English pronunciation (WCAG 3.1.2, Language of
       Parts). Both attributes inherit down the DOM tree, which display:contents does not
       interrupt. `role="region"` + a localized name make the embed a landmark a screen-reader
       user can jump to and out of, rather than an unbounded run of content in the middle of
       somebody else's page. */
    <div
      ref={themeRootRef}
      aria-label={t('widget.label')}
      className={`${WIDGET_SCOPE_CLASS} ${getInitialTheme()}`}
      dir={i18n.dir(activeLocale)}
      lang={activeLocale}
      role="region"
      style={{ display: 'contents' }}
    >
      <App
        apiKey={config.key ?? ''}
        defaultLocale={config.locale}
        hasMap={hasMap}
        linkable={linkable}
        themeRootRef={themeRootRef}
      />
    </div>
  )

  // Never switches after the first render — `mount` is a ref — so this can't remount the tree
  // mid-session.
  return (
    <AtlasRouter mode={mount.current.mode} path={mount.current.path}>
      {atlas}
    </AtlasRouter>
  )
}

// ===== THE CUSTOM ELEMENT ===== //

// r2wc's element implements three standard callbacks; the third, `attributeChangedCallback`, is
// the one that matters here — see the constructor below.
type AtlasElement = HTMLElement & {
  connectedCallback(): void
  disconnectedCallback(): void
}

/**
 * r2wc's own "am I connected" flag, a globally registered symbol.
 *
 * It initialises the flag to **true in its constructor**, and its `attributeChangedCallback`
 * renders whenever the flag is set — so an element carrying any observed attribute would mount
 * its React root during attribute upgrade, BEFORE `connectedCallback` runs at all. A one-per-page
 * rule enforced in `connectedCallback` would therefore refuse an element that had already
 * mounted, and say so in a message that wasn't true.
 *
 * This element observes no attributes any more (configuration comes from the loader's script
 * URL), so that path is much harder to reach — but the reset is kept, because what guarantees the
 * ordering is a language rule rather than a version of r2wc: base-class field initialisers run
 * inside `super()`, so a derived constructor body always follows them. Removing it would make the
 * lifecycle depend on r2wc's internals staying the shape they are.
 */
const R2WC_CONNECTED = Symbol.for('r2wc.connected')

// No `props`: the element observes no attributes at all. Everything the widget needs was parsed
// off the loader's script URL before this element existed, and lives in `config/embed.ts`.
const AtlasElementBase = r2wc(Widget) as unknown as new () => AtlasElement

// Which element owns the page. A widget owns page-global singletons — the API key
// (`config/api/auth`), the boot config (`config/embed`), and BrandTheme's theme root and
// system-theme watcher — so a second <sahaj-atlas> would run on instance A's key and steal its
// theme root, in silence. Exactly one runs, and the rule is enforced where the thing being
// counted actually lives: the element, not a React render pass.
let owner: AtlasElement | null = null

/**
 * How long a removed element has to come back before its page-global state is released.
 *
 * **Moving a node is a disconnect followed by a connect**, and page builders do it: Elementor's
 * "Optimized Markup" relocates elements after load. Releasing the API key and clearing the query
 * cache the instant an element is removed therefore meant a builder rearranging its canvas wiped
 * an hour of warm cache (`WHOLESALE_GC_TIME`) mid-session and refetched the whole feed.
 *
 * `Element.moveBefore()` — which preserves state across a move — does not help twice over: no
 * Safari support, and it is the *host* who would have to call it.
 *
 * So the teardown is deferred rather than removed. The reason it exists is unchanged and still
 * load-bearing: an element re-added with a DIFFERENT `key` must not authenticate as the first,
 * and only `['client', apiKey]` carries the credential in its key — `['regions']`, `['geojson']`,
 * the titles sliver and every event are key-agnostic, so a re-add under another key would read
 * the first key's responses out of the cache.
 */
const TEARDOWN_GRACE_MS = 1_000

let pendingTeardown: ReturnType<typeof setTimeout> | null = null

/** Release the page-global state an element owned. Idempotent. */
function releaseOwnership() {
  pendingTeardown = null
  owner = null
  atlasAuth.apiKey = null
  queryClient.clear()

  // The attestation is page-global state like the rest of this: a host SPA that unmounted the
  // widget would otherwise leave a marker standing over a page with no embed on it. One call, like
  // its two neighbours — the flag and the marker are `announceEmbed`'s to release, not ours to poke.
  releaseAnnouncement()
}

class SahajAtlasElement extends AtlasElementBase {
  constructor() {
    super()
    ;(this as unknown as Record<symbol, boolean>)[R2WC_CONNECTED] = false
  }

  connectedCallback() {
    if (pendingTeardown) {
      clearTimeout(pendingTeardown)

      // A different element arriving while the old one's release is pending means the old one is
      // genuinely gone — run the release now so this element does not inherit its key, then let
      // it take ownership below. Only a re-connection of the SAME element cancels outright.
      if (owner !== this) {
        releaseOwnership()
      } else {
        pendingTeardown = null
      }
    }

    if (owner && owner !== this && owner.isConnected) {
      reportIntegrationWarning(
        `only one <${ELEMENT_NAME}> runs per page — this one will not render.`,
      )

      return
    }

    owner = this
    super.connectedCallback()
  }

  disconnectedCallback() {
    // Deferred, not immediate — see TEARDOWN_GRACE_MS. A duplicate that was refused while this
    // one lived stays refused either way: it gets no second connectedCallback.
    if (owner === this && !pendingTeardown) {
      pendingTeardown = setTimeout(releaseOwnership, TEARDOWN_GRACE_MS)
    }

    super.disconnectedCallback()
  }
}

/**
 * Define the element and hand it the configuration the loader parsed.
 *
 * Called by `auto.js` once the element is near the viewport. Everything it needs was decided
 * before this module was fetched, which is what lets the whole widget stay out of the host's
 * initial payload.
 *
 * It deliberately takes no element: defining the tag upgrades whatever is already in the
 * document, so the loader's element needs no handing over and a second parameter would only
 * invite someone to think this renders into it.
 *
 * Nothing is sent from here. The report is parked on the boot singleton for `announceMount` to
 * send once the widget has actually rendered — this function can be called on a page whose element
 * never mounts.
 */
export function boot(
  config: LoaderConfig,
  observed: EmbedFingerprint | null = null,
  report?: EmbedReport,
): void {
  embed.config = config
  embed.observed = observed
  // Stashed rather than sent: defining an element is not a mount, and a report filed here would
  // attest to a widget that has not rendered and might never. `announceMount` sends it.
  embed.report = report ?? null

  // Guarded: `customElements.define` throws NotSupportedError on a name that is already
  // registered, and two copies of the embed script on one page is a plausible mistake. The second
  // copy is a no-op with a note to the console, not an exception in the host's.
  if (customElements.get(ELEMENT_NAME)) {
    reportIntegrationWarning(
      `<${ELEMENT_NAME}> is already defined — the embed script is on this page twice.`,
    )
  } else {
    customElements.define(ELEMENT_NAME, SahajAtlasElement)
  }
}
