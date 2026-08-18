import type { EmbedFingerprint } from './loader/detect'
import type { LoaderConfig } from './loader/config'
import type { EmbedReport } from './loader/report'
import type { MountRoute } from './lib/shape'

import r2wc from '@r2wc/react-to-web-component'
import { HashRouter, MemoryRouter } from 'react-router'
import { useEffect, useRef } from 'react'

import App, { RootBoundary } from './App'
import atlasAuth from './config/api/auth'
import embed from './config/embed'
import i18n from './config/i18n'
import { useLocale } from './hooks/use-locale'
import { getInitialTheme } from './hooks/use-theme'
import { ELEMENT_NAME } from './lib/element'
import { atlasError, reportIntegrationWarning, reportInternalError } from './lib/report'
import { SLOT_WARNING_MESSAGE, mapSlotWarning } from './lib/embed-slot'
import { WIDGET_SCOPE_CLASS } from './lib/scope'
import { HASH_BASE, mountRoute } from './lib/shape'
import { queryClient } from './config/query-client'

// Implementation of the embeddable widget's custom element.
//
// **This bundle is no longer what a host loads.** `auto.js` (`src/loader/`) is the one script in
// the snippet; it parses the configuration off its own URL, creates or adopts the element, waits
// until the element is near the viewport, and only then imports this module and calls `boot`.
// A host therefore pays ~3 KiB up front instead of the whole widget, and nothing here runs on a
// page whose embed is never scrolled to. Demo in: demo.html

/**
 * Act on the mount decision (`mountRoute`, `lib/shape/hash.ts`): take the URL fragment when it's
 * free, and degrade if the host won't let us.
 *
 * The write is a **`replaceState`**, never a `window.location.hash = …` assignment. An assignment
 * pushes a host history entry, so the visitor's first Back press would appear to do nothing — the
 * same host-history pollution `dismissAction` is careful to avoid on every dismissal.
 * `history.state` is passed through so whatever the host put there survives.
 */
function claimFragment(route: MountRoute): MountRoute {
  if (!route.write) return route

  try {
    // Absolutised against the CURRENT location, not handed over as the bare `#!…` reference it
    // is. A relative argument to `replaceState` resolves against the document BASE url, so on a
    // host page carrying `<base href="/blog/">` a bare fragment would rewrite the visitor's path
    // and drop their query string; a cross-origin `<base>` would throw instead, permanently
    // downgrading that site to the memory branch below. react-router's own hash history
    // special-cases `<base>` for the same reason.
    const url = new URL(window.location.href)

    url.hash = route.write
    window.history.replaceState(window.history.state, '', url)

    return route
  } catch (error) {
    // A sandboxed iframe (or a `file://` document) can refuse a same-document replaceState.
    // Mounting a HashRouter over a fragment we failed to claim renders nothing at all, so
    // degrade to the off-URL routing the host-anchor case uses.
    //
    // **The engine's own error is deliberately not what gets reported** (issue #108). A refused
    // `replaceState` throws a DOMException whose message embeds the URL it refused — the host's
    // query string and fragment included — and a thrown message is the one field that reaches
    // Sentry unfiltered. Sending it would walk the host's reset token straight past
    // `hostPageUrl`, which exists to strip exactly that. So we report a sentence we built. The
    // exception's NAME is the diagnostic half (`SecurityError` means sandboxed) and carries no
    // URL; it is read behind a guard because a hostile getter must not take the mount path down
    // with it.
    let name = 'unknown'

    try {
      name = String((error as { name?: unknown })?.name ?? 'unknown')
    } catch {
      // Keep the default — a label is not worth a throw here.
    }

    reportInternalError(
      atlasError('unknown', `refused replaceState claiming the URL fragment (${name})`),
      'widget: could not claim the URL fragment',
    )

    return { router: 'memory', path: route.path }
  }
}

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

  // Who owns the URL fragment, and where the widget boots — decided ONCE, on the first render.
  // Guarded to it because the root hash (`#!/`) recurs whenever the visitor navigates back home
  // and Widget re-renders reactively (locale changes): re-deciding would teleport them back to
  // the embed's default route.
  //
  // `hash` is the normal case. `memory` is the host-anchor case (issue #92): a page arriving at
  // `#respond` used to render a BLANK widget, because react-router reads that as a location
  // outside the `!` basename. The widget now routes off-URL there instead of overwriting an
  // anchor that is not its to take.
  //
  // The memory branch costs three real things, all of them better than a blank widget but none of
  // them free: the widget's route isn't in the URL, so it can't be deep-linked or shared from that
  // page; browser Back leaves the host page instead of stepping back through the widget; and
  // in-widget link hrefs resolve against the host origin rather than the fragment, so a
  // middle-click opens a host URL that probably 404s.
  //
  // The FIRST of those is something the tree can ask about rather than something it finds out by
  // handing a viewer the wrong link: this branch is the sole source of the `linkable` mode axis
  // (`config/mode.ts`, issue #115), which is why it is passed down from here instead of re-read
  // off `window.location` where it's wanted.
  //
  // Re-entrancy: `useLocale` can suspend on a cold i18n boot, which makes React discard and retry
  // this render — recreating the ref and re-running `claimFragment`. That is safe, and not by
  // accident: the retry reads the hash the first pass just wrote, so `mountRoute` returns it as a
  // route and asks for no second write.
  const mount = useRef<MountRoute>()

  if (!mount.current) {
    mount.current = claimFragment(mountRoute(window.location.hash, config.route))
  }

  // One name for the one decision: it picks the router below AND is the `linkable` mode axis
  // handed to the tree. Deriving both from the same const is what stops a later reader from
  // answering "is our route in the URL?" a second, divergent way.
  const linkable = mount.current.router === 'hash'
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

    // Guarded for the same reason `claimFragment` above is, and it is the sharper case of the
    // two: these are four reads of a DOM we do not own, made purely to produce a console line. A
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

  // Never switches after the first render — `mount` is a ref — so this branch can't remount the
  // tree mid-session.
  return linkable ? (
    <HashRouter basename={HASH_BASE}>{atlas}</HashRouter>
  ) : (
    <MemoryRouter initialEntries={[mount.current.path]}>{atlas}</MemoryRouter>
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
 */
export function boot(
  config: LoaderConfig,
  observed: EmbedFingerprint | null = null,
  report?: EmbedReport,
): void {
  embed.config = config
  embed.observed = observed

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

  // The endpoint is a separate SahajCloud ticket. Until it exists the observation is still worth
  // making — it drives the console diagnostics and, later, the canonical decision — so the send
  // is the only part that waits.
  void report
}
