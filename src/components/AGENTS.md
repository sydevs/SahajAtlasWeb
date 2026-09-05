# Components (Radix + Tailwind)

> **Taxonomy and conventions live in [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md)**
> (atoms / molecules / organisms, named exports + per-tier barrels, props typing,
> `tailwind-variants`, when to wrap a primitive). Story and preview conventions live in
> [`STORYBOOK.md`](../../STORYBOOK.md) (Ladle). Read those before adding a component.

## Prefer the existing atoms, then Radix

**There is no NextUI in this repo.** We removed it in favor of
[Radix UI](https://www.radix-ui.com) primitives plus `tailwind-variants`. Do not
reach for `@nextui-org/react` — it is not a dependency.

Before hand-rolling UI, check in this order:

1. **`src/components/atoms/`** — Alert, Button, Checkbox, Chip, Combobox, Drawer,
   Dropdown, Input, Link, Modal, RadioGroup, Select, Slider, Spinner, Textarea,
   ToggleGroup already exist and carry the app's tokens and focus behavior. Drawer
   (vaul) is the surface for anything that is a _place_ in the URL-driven stack.
   Modal (Radix Dialog) is the ephemeral surface that never touches the URL or
   history. Input and Textarea wrap the native controls on the shared `fieldChrome`
   recipe. `Combobox` is the search-in-the-field picker (Radix Popover + cmdk — the
   region filter). `Select` is the plain list picker. Every form-control atom shares
   one error and active-state interface: **`isInvalid`** (danger visual plus
   `aria-invalid`, with `aria-describedby` for the error text) and **`highlight`**
   (tints the _unselected_ state, no layout shift, to flag an active filter). See
   `DESIGN_SYSTEM.md`.
2. **Radix** for an unstyled primitive to build on (`@radix-ui/react-*` — dialog,
   select, popover, checkbox, switch, slider, toggle-group, dropdown-menu, label
   are installed). Radix owns the interaction and ARIA. We own the Tailwind skin.
3. Only then write something new, in the right atomic tier per `DESIGN_SYSTEM.md`.

Fewer custom components means less maintenance and a more consistent look.

## Styling

- Tailwind 3 utility classes are the default. For components with variants
  (size, color, state), use **`tailwind-variants`** (`tv(...)`) instead of ad-hoc
  `clsx` string concatenation — it is already a dependency and matches the Radix +
  Tailwind styling model. See `src/components/atoms/Chip/Chip.tsx` for the reference.
- `clsx` is fine for simple conditional class joins.
- Global styles and Tailwind layers live in `src/styles/globals.css`. The widget
  injects its CSS via JS (`vite-plugin-css-injected-by-js`) so it works when
  embedded. Do not rely on a separate stylesheet `<link>`.

**The CSS-scoping invariant is "the element a rule PAINTS is inside the widget," not
"the selector string starts with the scope prefix."** The minifier runs after scoping
and can fold the prefix into the middle of a selector, so a head-anchored check would
wrongly flag sound CSS as a leak (issue #104). Read this before touching the scoping
pipeline or its check.

- **The scoping pass is mechanical, not a rule you follow** (issue #91). This
  stylesheet lands in the HOST document, so `scripts/postcss-scope-widget.mjs` runs
  last in the PostCSS chain and rewrites every emitted selector to `:where(.sy-atlas)`
  — Preflight, generated utilities, and the third-party sheets we `@import` (mapbox-gl,
  swiper, vaul, Radix Colors) included — and it namespaces every `@keyframes`.
  `scripts/assert-css-scoped.mjs` reads the CSS back out of the built bundle and
  fails `pnpm build` if anything escapes. Write plain selectors in `globals.css`.
  Hand-scoping is not required.
- **Why the check walks left instead of anchoring the head** (issue #104): swiper 12
  shipped native CSS nesting, and the scoping pass correctly leaves a nested rule to
  its parent's prefix. The MINIFIER then runs after us and flattens that nesting,
  folding the scope into the middle or the subject of the selector
  (`.swiper-pagination-disabled > :is(:where(.sy-atlas) .swiper-pagination)`). A
  head-anchored check called that a leak and failed a sound build. So
  `isSelectorScoped` walks left from the subject, looking for a compound pinned to
  the scope. Two results: we are **not** the last stage to rewrite a selector, so do
  not assume the emitted form matches what the pass wrote. The check also refuses a
  scope reached across a sibling combinator on purpose (a sibling of the scope ROOT
  is a host element), so a red gate can mean "not confined" rather than "leaks" — the
  message says which.
- **Three things the pass does NOT cover:**
  - A selector you write against `.sy-atlas` yourself passes through untouched. Use
    this to address the theme ROOT (also where the light/dark class lives), not
    something inside it.
  - CSS a library injects at RUNTIME never reaches the pass. vaul did this and leaked
    a bare `@keyframes fadeIn` into host pages until we patched it out
    (`patches/vaul@1.1.2.patch`). A new dependency that injects its own `<style>`
    needs its own scoping fix.
  - The prefix is `:where()` on purpose. Never simplify it to a bare class: `:where()`
    contributes zero specificity, so the cascade inside the widget stays unchanged. A
    bare `.sy-atlas` lifts every rule by one class, which then outranks runtime-injected
    third-party CSS — it once broke the Mapbox geocoder's input padding and put the
    search icon on top of the placeholder.
- **The scope class must stay on the theme root**, the same element as the light/dark
  class and `dir` — the scoped `dark:` and `rtl:` variants resolve both against one
  ancestor. `src/Widget.tsx` (embedded), `index.html` (standalone), and the Ladle
  decorator all apply it. `src/lib/scope.ts` owns the name, and
  `scripts/postcss-scope-widget.test.ts` fails if the four drift apart.
- **An overlay that portals to `document.body` renders unstyled.** Everything must
  portal to `overlayContainer()` (`src/lib/overlay.ts`), which targets the theme root
  — inside the scope, unlike `document.body`.
  **While a compact embed is expanded, that call returns the expanded surface
  instead** (issue #161). This is not tidiness: the surface is a MODAL Radix Dialog,
  so it traps focus in its own content and hides its siblings from assistive
  technology, and a drawer portaled beside it would be unreachable by keyboard. The
  surface is the one caller that must NOT see the override — a portal cannot render
  into its own subtree — so it reads `widgetOverlayContainer()` instead. It is a
  module singleton for the same reason the theme root is: `overlayContainer()` is
  called from render bodies inside third-party portals (vaul, Floating UI) that no
  context of ours can reach.
- **Host-authored rich text is sanitized by an allowlist, and the allowlist must be
  load-bearing.** `sanitizeDescription` (`organisms/EventDetails/sanitize.ts`) is the
  only DOMPurify call in the repo. Two ways it went silently inert before: an option
  that _replaces_ rather than intersects `ALLOWED_TAGS` (`USE_PROFILES` did exactly
  that, so the real policy became the full HTML profile), and options independent of
  `ALLOWED_ATTR` entirely — `ALLOW_DATA_ATTR` / `ALLOW_ARIA_ATTR` default to **true**
  and must be turned off by name. This markup lands on a HOST page, so the stakes are
  `style` overlays, `img src` beacons, `form` credential prompts, and live
  `data-vaul-*` hooks. Assert on the sanitizer's output whenever you change its
  config — nothing else will catch a regression (issue #101).
- **Host-authored rich text carries the `.colored-links` utility**, which owns the
  whole treatment for that content: link color AND `break-words`. One unbreakable run
  (a pasted URL, or the U+2800 braille blanks some authors use for spacing) otherwise
  widens the scroll container and gives the drawer a horizontal scrollbar. The
  Drawer's body slot is `overflow-x-hidden` as a backstop, not the fix.

## Widget and embedding constraints

This app ships as the `<sahaj-atlas>` custom element (`src/Widget.tsx`) embedded in
host pages, and it also runs standalone in dev. Because of that:

- **Routing is a query parameter on the host's URL** — `?atlas=/gb/london` (#154).
  `AtlasRouter` (`src/router.tsx`) runs over a hand-written `History`
  (`src/lib/atlas-history.ts`). The mount decision is `mountDecision`
  (`src/lib/shape/routing.ts`), made once at mount. Build links with react-router's
  `<Link>` / `useNavigate`, and never hand-build the parameter — `hrefFor` owns its
  encoding, including the `/` and `,` it restores so a shared link stays readable.
  The widget has no opinion about the host's `#anchor`: it never reads or writes the
  fragment.
  **`memory` mode is a degradation**, taken only where the document refuses
  `replaceState`. ⚠ It is NOT the same as a sandboxed iframe: in Chrome 151 a real
  `sandbox="allow-scripts"` frame has an opaque origin (`localStorage` throws) but
  still permits `replaceState` and `pushState`. A sandbox blocks `window.open`, not
  history writes.
  **`routing=path` takes its prefix from the client record's `canonical.embed`**,
  never from a script parameter — that is the same value SahajCloud composes
  canonical URLs from, and two independent copies could disagree. The route is then
  the pathname under that prefix, and `?atlas=` carries whatever the path does not:
  one claimed parameter, one encoder, in both modes.
  ⚠ **That prefix arrives over the network, so path mode WAITS for the client record
  before it builds a router** (`AtlasBoot`, `src/Widget.tsx`). Query mode never
  reaches that code. Every unhonorable path config falls back to query and reports
  why — no prefix on the record, or a page served outside it.
  **`file://` is explicitly not supported, and nothing may be built to accommodate
  it.** A `file://` document has no origin the API will accept and no CORS, so the
  widget fails before its router does. A branch whose only case is a configuration we
  do not support is never exercised, and it is never right — apply the same
  reasoning before adding insurance for any other unsupported host.
  ⚠ **The trap the history exists to avoid**: `Router` defaults `location.key` to a
  constant, so a history that does not mint one per entry collapses every
  `rememberCamera(location.key)` snapshot into a single bucket, and back-navigation
  restores the wrong viewport. `routing.router.test.tsx` asserts distinct keys.
- **Ask, don't infer** — never `window.location`. **"Can this route be handed to
  somebody?"** is `useHrefFor()` (`src/config/routing.tsx`), `undefined` in memory
  mode. **"Is the route on screen in the URL?"** is `linkable` on `WidgetMode`
  (`src/config/mode.ts`).
  **Never put `window.location.href` in front of a viewer.** For an event, ask
  `useShareUrl(event.webUrl, event.path)`: the canonical page wins in every mode,
  the event's own widget URL stands in otherwise, and `undefined` means render no
  share block — not the host page's own address, which names their article, not
  the meditation.
- **One `<sahaj-atlas>` per page.** `connectedCallback` refuses a second element,
  since the API key and BrandTheme's theme root are page-global singletons it
  would silently share. A second copy of the embed script is also a no-op
  (`customElements.get` guard). Both report via `reportIntegrationWarning`.
- Do not assume control of `<head>`, global CSS, or the full viewport — the host
  page owns those. Scope styles to the widget's own DOM.
- **The one thing the widget writes onto the host's own `<html>` is the readiness
  marker** (`data-sahaj-atlas-ready`, `src/lib/readiness.ts`, issue #153).
  SahajCloud verifies an embed by loading the host page through Cloudflare Browser
  Rendering and reading the DOM back, so the evidence has to sit at the top of the
  document. Two properties keep it honest. It publishes **only after React commits**
  (a mount effect in `Widget.tsx`), because a marker written on script load could
  attest to a page whose widget never rendered. And it is **removed with
  page-global ownership** (`releaseAnnouncement`), so it cannot outlive the widget it
  vouches for on a host SPA that unmounted it. It attests the routing the router
  _actually_ uses (`MountDecision.routing`), not the `routing` parameter somebody
  configured.
- **What a host can observe is documented in `docs/embedding.md`** — the attribute
  table, the CSP contract, sizing, the URL shape, the style-tag ids. It is the only
  doc an embedding site reads, so a change here that a host could notice is not
  finished until that guide (and `CHANGELOG.md`) says so, in the same PR. See the
  root `AGENTS.md` for the full rule.
- Provider stack lives in `src/providers.tsx` (React Query + Helmet + theme). Add new
  context providers there, not scattered across the tree.

## Responsive: which signal answers which question (issue #107)

The widget is embedded in layouts we do not own, so **"how big is the screen" and
"how big are we" are different questions** — and most of the app wants the second.
**Every responsive decision measures its own box through a ResizeObserver, not the
browser window.** Every decision names one of three signals
(`src/config/responsive.ts`):

- **container** — `useIsWide(element)` in `DrawerStack`, which owns the measurement,
  and `useIsWideWidget()` for descendants reading it back off `WidgetWidthContext`.
- **viewport** — `useIsWideViewport()`. Only where the screen genuinely is the
  question.
- **input** — `useCoarsePointer()`. For affordances that depend on the device.

**Reaching for the wrong signal fails silently**, so `src/config/responsive.test.ts`
asserts the viewport call sites as a closed list, the way `href.test.ts` pins the
app's three JSX anchors. A fourth call site turns the unit lane red instead of
shipping a narrow embed that quietly behaves like a desktop.

| Behavior | Signal | Why |
| --- | --- | --- |
| Drawer direction — left panel vs. bottom sheet (`DrawerStack`) | container (the map-less root, or the frame) | A fit question: does a 22rem side panel leave usable space beside it? Since #169 map mode has a frame where one exists — a contained embed's box, or the compact card's expanded dialog. |
| Drag handle, swipe-dismiss, `handleOnly`, the snap ladder | container (follows direction) | The handle exists only for a bottom sheet. `DrawerStack` passes it explicitly rather than trust the atom's own default, which would leave a narrow map-less sheet draggable with nothing on screen saying so. |
| Filter-overlay direction (right vs. bottom) | container | Same panel-vs-sheet question, same answer. |
| Sticky Register bar (`EventView`) | container | A snap sheet can scroll the CTA out of sight. This is a property of the sheet. |
| Contact — `tel:` vs. number + copy popover (`EventActions`) | input | Whether `tel:` reaches a dialer is hardware, not window width. This is the one place "narrow ⇒ mobile" reads wrong. |
| Map camera padding (`use-map-controller`) | container (the frame) | Camera padding must agree with whatever picked the panel it pads around. Reads `frameElement()` — `null`, and so the viewport, wherever no frame exists. |
| Anchored-panel geometry — `lg:inset-y-4`, `lg:rounded-2xl` (Drawer atom, PeekStrip) | viewport (accepted residue) | #169 broke "viewport equals container". A contained map can reach a `lg:` crossing its frame never sees. What survives is cosmetic float and rounding. |
| SettingsMenu cog offset (`DrawerStack`) | container (via `isWide`) | Clears the left panel, so it must agree with whatever decided there is one. Outside a frame, `isWide` is the viewport's own answer. |
| Modal box sizing | container (the frame) | Portals through `overlayContainer()`, so a frame contains and clips it on both axes. |
| `EventHeader`'s `md:pt-4`, `ListItem`'s `lg:h-9 lg:w-9` | viewport (accepted residue) | The only two variants that fire wrongly in a narrow map-less embed. Both are cosmetic — fix them if you are already there. |
| Compact card vs. full interface (`AppShell`) | the slot, measured ONCE at mount | Not one of the three signals, and deliberately not reactive — see below. |
| Reduced motion, color scheme | preference | Not a size question at all — see the accessibility motion seams below. |

Two properties of the mechanism are load-bearing:

- **The container signal is a strict generalization, not a behavior change.** In map
  mode there is nothing to measure — the theme root is `display: contents`, the
  canvas is `position: fixed; inset: 0`, every drawer is `fixed` — so `useIsWide`
  falls through to the viewport and returns exactly what the old `useIsDesktop` did.
  ⚠ Since #169 a map embed can have its own frame too, and then it is measured like
  any other box.
- **The first measurement is not damped. Every later one is.** The seed runs in a
  layout effect, so the right model is on screen from the first frame. Damping it too
  would paint a frame of the viewport's answer and then remount the drawer — the
  exact thrash the delay exists to prevent.

### Map mode is contained by a FRAME, or it takes the viewport (issue #169)

**⚠ This section used to say containment was intractable. It is implemented — do not
restore that claim.** Every premise of the old argument has been retired:

- vaul computed a snap-point sheet's translate from the **window** height, so a
  contained sheet was pushed off-screen by the library's own math → its `container`
  prop is now passed (`measureAgainst`, distinct from the portal target).
- `--sy-sheet-top`, which pins the sticky Register bar, is a viewport-relative
  `getBoundingClientRect().top` → the frame's own top is now subtracted, zero where
  there is no frame.
- every drawer, peek strip, and cog is `position: fixed` and `100dvh` overshot →
  **`--sy-frame-h`** is `100dvh` on `.sy-atlas` and `100%` under `[data-sy-frame]`,
  right in both.

**The frame is `contain: layout`, and that one property does all of it.** It makes
the element the containing block for every fixed descendant, so the canvas, the
drawers, and the strips are identical in both modes — containment is NOT a
`fixed`-to-`absolute` swap. It also makes the frame a **stacking context**, which
answers "what is our z-index relative to the host's": the widget's `z-30`…`z-50` stop
competing with the host's CSS. `lib/overlay.ts` holds the one reference
(`setFrame` / `frameElement`) — there is only ever one.

⚠ **`contain: layout` must never go on the scope root, and this rule does not
change.** Same mechanism, opposite direction: on the root it would re-parent the
fixed layer onto the HOST's element, a box a map-less embed shares with the host's
page. On `MapFrame`, re-parenting is the entire point, and the element is ours.

**What decides containment is whether the host sized the element, and nothing
else** (`mapIsContained`). Map mode renders everything fixed, so `<sahaj-atlas>`
measures zero height on its own — a height cannot appear by accident. An
**unsized** map embed fills the viewport, and one without the page to itself gets a
**compact card** instead of a takeover — `lib/slot-decision.ts` measures at mount
and the card's button opens the map full-screen.

### A slot too small for any layout: the compact card (issue #161)

#107 made the widget adapt to its box. Below a floor there is no layout left to adapt
to, so the widget renders **`CompactEmbedView`** (`src/views/`) instead — one heading
and one task-named button that opens the interface somewhere it fits.

- **One question, not three.** The question underneath the earlier three-predicate
  version: **is the space we have meaningfully smaller than the space the button
  would take the visitor to?** `resolveDestination` answers where the button goes,
  `embedLayout` answers what to render, and `decideSlot` (`lib/slot-decision.ts`)
  joins them — because the join is where the original bug lived.
- **The destination discriminator is NOT "am I framed," though it looks like it
  should be.** It is whether the local viewport is bigger than the slot. Framing
  only picks the fallback when it is not. A frame IS a viewport (`position: fixed`
  resolves against it), so a framed map embed at 400×600 must stay full.
- **`SLOT_GAIN` is one ratio where there were three** — 0.8, ratcheted in both
  directions against real false positives and false negatives.
- **`AppShell` owns the decision, above `MapProvider`**, so the whole map subtree can
  stay unmounted, keeping mapbox-gl unfetched. That saving is invisible to `pnpm size`
  by design, since mapbox-gl is a dynamic import never in the eager graph.
- **The measurement happens once, at first render, never on resize.** Resizing
  remounts the widget and discards the in-widget history, so a host page animating a
  sidebar would throw a visitor's session away mid-read. There is deliberately **no
  override parameter** for this.
- **The card makes no data requests.** `CompactEmbedView.test.tsx` asserts that
  absence, because a per-row size estimate once cost a feed read, a titles read, and
  an IP lookup on every sidebar page view nobody scrolled to.
- **Expansion goes through a seam** (`src/hooks/use-expansion.tsx`), the same shape
  as `MapController`. A framed embed gets an anchor (`lib/fallback-url.ts`) instead,
  through the `Button` atom's href form — not a new JSX anchor, since `href.test.ts`
  pins that inventory to three components.
- **What it expands into is a module-private dialog inside `CompactEmbedView`, and it
  keeps a margin.** It is not the `Dialog` atom: it publishes itself as the app's
  portal target, needs `contain: layout` since this app's interface is fixed
  throughout, and has exactly one caller. `Modal` stays the generic dialog atom. A
  full-bleed layer would read as a navigation — the host's page simply gone — so the
  dialog insets, the host's page shows through the margin, and clicking it closes
  the dialog. ⚠ **`contain: layout` on the dialog content makes the margin
  possible**: without it, every fixed descendant resolves against the viewport and
  escapes to the screen edge. This is the same property forbidden on the SCOPE
  ROOT, pointed the other way — never move it up the tree.
- **A deep link loads eagerly and opens. A configured default does not.** The
  distinction is whether the **page** URL itself carried `?atlas=`
  (`routeFromPage` / `MountDecision.fromPage`) — the loader lazy-mounts behind an
  `IntersectionObserver`, so without this a deep-linked widget would mount
  mid-scroll and slam a modal over the page.

⚠ **An effect in `AppShell` runs for a collapsed card too, and that caused four
separate bugs.** Anything that writes the host's URL, reads data, injects a script, or
reports must mount with the **interface** (`FullInterface`), never with the shell:

| Fired from a collapsed card | Cost |
| --- | --- |
| The home-region redirect | `navigate` wrote `?atlas=/nl` onto the HOST's URL. Reloading that URL opened a dialog nobody asked for. |
| `api.warmCaches()` | The whole events feed and region tree, on every page view of a sidebar nobody pressed. |
| `Fathom.load` | Our tracker script injected into the host's page. |
| `Fathom.trackPageview` | A pageview of `/` recorded for an interface nobody opened. |

**One property underwrites all four**: React never renders the card's `children`
until the dialog opens — which also keeps mapbox-gl unfetched.
`CompactEmbedView.mount.test.tsx` pins this. It must run under **jsdom**: the
dialog's content is a portal, so `renderToStaticMarkup` renders none of it, and an
SSR version of the assertion would be vacuous (see `docs/testing.md`).

Two effects deliberately still fire from a collapsed card: the readiness marker and
the embed report, since both attest that the widget booted, whether or not anyone
opened it. `clients/me` also stays, since the card is themed and localized from it.

**Three things about the dialog were found in a browser, and could not have been
found any other way.**

- Escape never reaches the surface's own dialog on its own: the drawer stack inside
  is vaul over Radix Dialog, so Radix delivers the key to the topmost dismissable
  layer. Once the stack has nowhere left to dismiss, the ladder is finished in
  `DrawerStack`'s `onEscapeKeyDown`, which calls `useExpansion().collapse()` — a
  host could otherwise hide, confine, or scroll away the only remaining exit.
- Radix's focus restore targets a `Dialog.Trigger` that does not exist here
  (expansion is requested through the seam), so the surface records the opener
  itself, scoped to the widget root rather than `document` — Safari and Firefox on
  macOS do not focus a `<button>` on click, and a document-wide recorder would let
  collapse steal focus from whatever the HOST had focused earlier.
- **The dialog keeps a margin, and clicking it closes the dialog.** This retired an
  earlier `ResizeObserver` (`surfaceCoversPage`) that watched its own box and closed
  itself when it stopped covering the viewport. With an outside to click and Escape
  reaching the ladder above, Radix already maintains two exits for free, so a
  confined dialog is a cosmetic problem, not a trap.

⚠ **The margin means nothing inside the dialog may size itself off the viewport.**
Every drawer, peek strip, and sheet is `position: fixed`, so `100dvh` is only right
while nothing has taken the containing block — and the dialog takes it, 16–32px
short. The fix is one token, `--sy-frame-h`: `100dvh` on `.sy-atlas`, `100%` on
`[data-sy-frame]` (which the dialog and `MapFrame` both carry), so one value is right
in both places. `--sy-sheet-top` needed the matching correction, since the dialog's
own top must be subtracted from its viewport-coordinate source.

**vaul is handled by its own API, not a patch.** It measures `container` when given
one and `window.innerHeight` otherwise, so the Drawer atom forwards `container` to
`Vaul.Root` — the same element it portals into, so the box vaul measures can never
differ from the box it renders in.

⚠ **A host ancestor carrying `transform`, `filter`, `perspective`, `contain`, or a
`will-change` naming one of them confines the surface to that element** — re-measure
this against the table below for any change. `container-type` is **not** on that
list, however often it is claimed to be.

**Nothing detects this at runtime any more, and that is the settled answer, not an
omission.** An earlier ~80-line `getComputedStyle` walk and an earlier
`ResizeObserver` are both **removed** and are not coming back — the margin retired
both, since clicking outside and Escape are two exits Radix already maintains for
free.

⚠ If you find yourself citing `SURFACE_CONFINED_MESSAGE` or `surfaceCoversPage`,
neither exists any more — grep before relying on either.

### Why there is no `@tailwindcss/container-queries`

It was evaluated and rejected for one reason: **there is no CSS-side case for it to
serve.** Every layout-critical Tailwind variant in the app is either in the map-mode
anchored path, where viewport equals container, or has no effect at all in `filled`
map-less mode — measured at a 1440px viewport, where a `filled` drawer computes to
`position: absolute`, `max-width: none`, filling its box to the pixel.

**A caution against a plausible-sounding claim that is FALSE.** It is widely
repeated that `container-type: inline-size` makes an element a containing block for
`position: fixed` descendants — which would matter enormously here, since the map
canvas, every drawer, the peek strips, and the cog are all fixed. Measured in
Chrome 151:

| host style | fixed child resolves against |
| --- | --- |
| `container-type: inline-size` | the **viewport** (1440×900) — no re-parenting |
| `container-type: size` | the **viewport** (1440×900) — no re-parenting |
| `contain: layout` | the **host** (400×200) |
| `transform: translateZ(0)` | the **host** (400×200) |

So `container-type` is _not_ the hazard. `contain` and `transform` are. Do not "fix"
code to match the common assumption — it is the assumption that is wrong. If a
genuine CSS-side case ever appears, this table does not block adopting the plugin —
but keep `contain: layout` and any transform off every ancestor of the fixed layer,
and re-measure rather than trust either this table or the folklore it fixes.

## Structure

- Components are grouped by atomic tier — `src/components/{atoms,molecules,organisms}/`
  — each in its own **PascalCase folder** (`Chip/Chip.tsx` + stories + `index.ts`),
  with a barrel `index.ts` per tier (the `Icons/` and `Mapbox/` sub-modules group
  several files). `src/views/` holds the route screens. App code imports from the
  tier barrels. Components import each other by component-folder path. See
  `DESIGN_SYSTEM.md`.
- **Explicit named exports — no `export *`.** Every component and tier barrel lists
  exactly what it surfaces: the primary component(s) plus the `<Name>Props` type.
  Keep single-use internals (private modals, row primitives, helper sub-cards)
  module-private. The `Icons/` icon-set module is the one wildcard exception. See
  the export rules in `DESIGN_SYSTEM.md`.
- **Atoms stay primitive.** Put pure domain helpers (e.g. `isSoon`) in `src/lib/`,
  not in an atom, and keep single-use compositions inlined in their one parent.
- Keep components presentational where possible. Pull data via hooks
  (`src/hooks/`) and React Query (`src/config/api`), and read shared state from
  zustand selectors. See `docs/rules/data-layer.md` and
  `docs/rules/i18n-and-state.md`.
- **A row in a growing list should not subscribe to the URL.** `EventListItem` is the
  repo's one `React.memo`, since the search results list pages to hundreds of rows.
  `memo` only holds because the card reads the searched place from a prop, not
  `useSearchParams` — router context bypasses `memo` entirely.

## Rendering an anchor

**Do not render a bare `<a href={…}>`.** Use the `Link` atom. If a component
genuinely must emit its own anchor, its href must go through **`isSafeHref`**
(`src/lib/shape/href.ts`) first — `safePath`-clean, or an allowed scheme — and a
refusal reports via `reportInternalError` and degrades to inert content. Exactly
three components render a JSX anchor (`Link`, `Button`'s href form, `ActionRow`'s
`ActionCircle`), and `src/lib/shape/href.test.ts` **asserts** that inventory, so a
fourth turns the unit lane red until it is gated.

For why this is a shared predicate rather than a per-component check, and why
"site-relative" must mean `safePath` rather than `startsWith('/')`, see
`docs/rules/data-layer.md` → "Server-provided routes are untrusted until
`safePath`." That rule is path-scoped and does not auto-load here — read it before
touching an anchor.

## Accessibility

`jsx-a11y` is enabled. Pair `onClick` on non-button elements with keyboard handlers
(or use a real `<button>` / the `Button` atom), and provide `alt` / ARIA labels. The
lint warns — do not ignore it on interactive elements.

**Motion needs a way out** (WCAG 2.2.2, issue #104). Anything that moves on its own
for more than five seconds needs a visible, keyboard-operable control to stop it, and
must not move at all under `prefers-reduced-motion: reduce` — read live via
**`usePrefersReducedMotion`** (`src/hooks/use-reduced-motion.ts`), not a one-shot
read at mount. The image carousel is the worked example: its pause/play toggle keeps
one accessible name while `aria-pressed` carries the state, and it renders only when
the carousel actually autoplays.

**The rest of the app's motion is off under that preference too, through three
seams — one per animation technology** (issue #102):

- **framer-motion** — `MotionConfig` in `src/providers.tsx` covers every `motion.*`
  in the tree, driven by `usePrefersReducedMotion()`, NOT framer's own
  `reducedMotion="user"` (which reads the media query once at mount and misses a
  mid-session change).
- **vaul's drawers** animate in CSS, so an additive
  `@media (prefers-reduced-motion: reduce)` block at the foot of
  `src/styles/vaul.css` kills both `animation` and `transition` — vaul's own
  `[data-vaul-animate='false']` hook covers only the first.
- **The map camera needs nothing.** mapbox-gl already short-circuits `flyTo` to
  `jumpTo`, zeroes `easeTo`'s duration, and reads the media query live — see the
  comment in `src/hooks/use-mapbox.ts` for the two ways to break this
  (`respectPrefersReducedMotion: false`, or `essential: true` on a camera call).

**Forms announce their errors, once** (WCAG 4.1.3 / 3.3.1, issue #102). `FormField`'s
error span defaults to `role="alert"`, telling a viewer about invalid fields they are
not focused on. `aria-describedby` covers the one they are. Focus moves to the first
invalid field via react-hook-form's `shouldFocusError`, so a custom form control must
**forward a ref** to something focusable, or RHF skips it silently (this is why
`RadioGroup` is a `forwardRef`). Set `announceError={false}` on a form that checks
validity as the viewer types.

**Copy stays a prop, even for screen-reader-only text.** No atom calls
`useTranslation` — `Spinner`'s `srLabel` defaults to English instead, since a spinner
can render in a Suspense fallback before translation bundles load.

**A control on the drawer needs `data-vaul-no-drag`.** vaul reads a tap carrying any
micro-movement as a drag and swallows the click, so a control without this attribute
fires only intermittently on touch. The `Button` atom sets it for you. Anything
hand-rolled (`ActionRow`, the carousel's pause button) must carry it itself.
