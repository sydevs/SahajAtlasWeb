# Components (Radix + Tailwind)

> **Taxonomy & conventions live in [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md)**
> (atoms / molecules / organisms, named exports + per-tier barrels, props typing,
> `tailwind-variants`, when-to-wrap-a-primitive). Story/preview conventions live in
> [`STORYBOOK.md`](../../STORYBOOK.md) (Ladle). Skim those before adding a component.

## Prefer the existing atoms, then Radix

**There is no NextUI in this repo** — it was removed in favour of
[Radix UI](https://www.radix-ui.com) primitives + `tailwind-variants`. Don't
reach for `@nextui-org/react`; it isn't a dependency.

Before hand-rolling UI, in this order:

1. **Check `src/components/atoms/`** — Alert, Button, Checkbox, Chip, Combobox,
   Drawer, Dropdown, Input, Link, Modal, RadioGroup, Select, Slider, Spinner,
   Textarea, ToggleGroup already exist and carry the app's tokens and focus
   behaviour. Drawer (vaul) is the surface for anything that's a _place_ in the
   URL-driven stack; Modal (Radix Dialog) is the ephemeral one that never touches
   the URL or history. Input/Textarea wrap the native controls on the shared
   `fieldChrome` recipe; `Combobox` is the search-in-the-field picker (Radix Popover
   - cmdk — the region filter), `Select` the plain list picker. Every form-control
     atom shares one error/active-state interface: **`isInvalid`** (danger visual +
     `aria-invalid`, with `aria-describedby` for the error text) and **`highlight`**
     (primary-tints the _unselected_ state, no layout shift, to flag an active
     filter) — see `DESIGN_SYSTEM.md`.
2. **Check Radix** for an unstyled primitive to build on (`@radix-ui/react-*` —
   dialog, select, popover, checkbox, switch, slider, toggle-group, dropdown-menu,
   label are installed). Radix owns the interaction/ARIA; we own the Tailwind skin.
3. Only then write something new, in the right atomic tier per `DESIGN_SYSTEM.md`.

Fewer custom components means less maintenance and a consistent look.

## Styling

- Tailwind 3 utility classes are the default. For components with variants
  (size/color/state), use **`tailwind-variants`** (`tv(...)`) rather than
  ad-hoc `clsx` string concatenation — it's already a dependency and matches the
  Radix + Tailwind styling model. See `src/components/atoms/Chip/Chip.tsx` for the reference usage.
- `clsx` is fine for simple conditional class joins.
- Global styles and Tailwind layers live in `src/styles/globals.css`. The
  widget injects its CSS via JS (`vite-plugin-css-injected-by-js`) so it works
  when embedded — don't rely on a separate stylesheet `<link>`.
- **That stylesheet lands in the HOST document — scoping it is now MECHANICAL, not a
  rule you follow** (issue #91). `scripts/postcss-scope-widget.mjs` runs last in the
  PostCSS chain and rewrites every emitted selector to `:where(.sy-atlas)` — Preflight,
  generated utilities, and the third-party sheets we `@import` (mapbox-gl, swiper,
  vaul, Radix Colors) included — plus it namespaces every `@keyframes`.
  `scripts/assert-css-scoped.mjs` reads the CSS back out of the built bundle and fails
  `pnpm build` if anything escapes. So write plain selectors in `globals.css`; hand-
  scoping is no longer required, and the old leaks (a bare `main {}`, a bare
  swiper-bullet rule) can no longer ship.
  **The invariant the gate enforces is "the element a rule PAINTS is inside the widget",
  not "the selector string starts with the scope"** (issue #104). Those were the same
  thing until swiper 12 arrived shipping native CSS nesting: the pass leaves a nested
  rule to its parent's prefix, correctly, and then the MINIFIER — which runs after us —
  flattens the nesting and folds the scope into the middle or the subject of the
  selector (`.swiper-pagination-disabled > :is(:where(.sy-atlas) .swiper-pagination)`).
  A head-anchored check called that a leak and failed the build on sound CSS. So
  `isSelectorScoped` now walks left from the subject looking for a compound pinned to
  the scope. Two consequences: **we are not the last stage to rewrite a selector**, so
  don't assume the emitted form matches what the pass wrote; and the check is
  deliberately conservative in places (it refuses a scope reached across a sibling
  combinator, because a sibling of the scope ROOT is a host element), so a red gate can
  mean "not confined" rather than "leaks" — the message says which.

  Three things this does NOT cover, so they still need care:

  - **A selector you write against `.sy-atlas` yourself is passed through untouched.**
    That is the escape hatch for rules that must address the theme ROOT (which is also
    where the light/dark class lives) rather than something inside it.
  - **CSS a library injects at RUNTIME never reaches the pass.** vaul did exactly this
    and leaked a bare `@keyframes fadeIn` into host pages until it was patched out
    (`patches/vaul@1.1.2.patch`). If a new dependency injects its own `<style>`, scoping
    it is a separate job.
  - **The prefix is `:where()` on purpose — never "simplify" it to a bare class.** It
    contributes zero specificity, so the cascade inside the widget is unchanged. A bare
    `.sy-atlas` lifts every rule by one class, which then outranks that runtime-injected
    third-party CSS: it broke the Mapbox geocoder's input padding, and the search icon
    landed on top of the placeholder.

- **The scope class must stay on the theme root**, the same element as the light/dark
  class and `dir` — the scoped `dark:` / `rtl:` variants resolve both against one
  ancestor. It is applied in `src/Widget.tsx` (embedded), `index.html` (standalone) and
  the Ladle decorator; `src/lib/scope.ts` owns the name and `scripts/postcss-scope-widget.test.ts`
  fails if the four drift apart.
- **An overlay that portals to `document.body` will render unstyled.** Everything must
  portal to `overlayContainer()` (`src/lib/overlay.ts`), which targets the theme root —
  that is inside the scope; `document.body` is not.
  **While a compact embed is expanded, that call returns the expanded surface instead**
  (issue #161), and the redirect is not tidiness: the surface is a MODAL Radix Dialog, so it
  traps focus in its own content and hides its siblings from assistive technology — a drawer
  portaled beside it would be unreachable by keyboard. The surface is the one caller that must
  NOT see the override (a portal cannot render into its own subtree), so it reads
  `widgetOverlayContainer()`. It is a module singleton for the same reason the theme root is:
  `overlayContainer()` is called from render bodies inside third-party portals (vaul, Floating
  UI) that no context of ours reaches.
- **Host-authored rich text is sanitized by an allowlist, and the allowlist has to be
  load-bearing.** `sanitizeDescription` (`organisms/EventDetails/sanitize.ts`) is the only
  DOMPurify call in the repo. Two ways it has already been silently inert: an option that
  _replaces_ rather than intersects with `ALLOWED_TAGS` (`USE_PROFILES` did exactly that,
  so the real policy was the full HTML profile), and the options that are independent of
  `ALLOWED_ATTR` entirely — `ALLOW_DATA_ATTR` / `ALLOW_ARIA_ATTR` default to **true** and
  have to be turned off by name. This markup lands in a HOST page, so the difference is
  `style` overlays, `img src` beacons, `form` credential prompts and live `data-vaul-*`
  hooks. Assert on the sanitizer's output when you change its config; nothing else will
  tell you (issue #101).
- **Host-authored rich text** carries the `.colored-links` utility, which owns the
  whole treatment for that content — link colour AND `break-words`. One unbreakable
  run (a pasted URL, or the U+2800 braille blanks authors use as spacing) otherwise
  widens the scroll container and gives the drawer a horizontal scrollbar. The
  Drawer's body slot is `overflow-x-hidden` as a backstop, not as the fix.

## Widget / embedding constraints

This app ships as the `<sahaj-atlas>` custom element (`src/Widget.tsx`) embedded
in host pages, **and** runs standalone in dev. Because of that:

- **Routing is a query parameter on the host's URL** — `?atlas=/gb/london` (#154). `AtlasRouter`
  (`src/router.tsx`) over a hand-written `History` (`src/lib/atlas-history.ts`); the mount decision
  is `mountDecision` (`src/lib/shape/routing.ts`), made once at mount. Build links with
  `react-router` `<Link>` / `useNavigate` and never hand-build the parameter — `hrefFor` owns its
  encoding, including the `/` and `,` it restores so a shared link stays readable.
  **The widget has no opinion about the host's `#anchor`.** It never reads or writes the fragment,
  so the whole three-way ours/free/foreign decision of #92 is gone.
  **`memory` is a degradation, not a mode anyone asks for**, taken only where the document refuses
  `replaceState`. ⚠ **That is NOT a sandboxed iframe, though this rule said so until #161 measured
  it**: in Chrome 151 a real `sandbox="allow-scripts"` frame has an opaque origin (`localStorage`
  throws) and still permits `replaceState` and `pushState`. What a sandbox blocks is `window.open`.
  **`routing=path` is implemented**, and its prefix comes from the client record's
  `canonical.embed` — never from a script parameter, because it is the same value SahajCloud
  composes canonical URLs from and two copies could disagree. The route is then the pathname under
  that prefix, and `?atlas=` carries whatever the path does not — the route's own query. One
  claimed parameter and one encoder in both modes.
  ⚠ **That prefix arrives over the network, so path mode WAITS for the client record before
  constructing its router** (`AtlasBoot`, `src/Widget.tsx`). Query mode never reaches that code.
  Anything reading the record above `App` needs what `App` provides — the API key must already be
  claimed, and a `QueryClientProvider` must be mounted, because the tree's own lives inside `App`,
  below the router this read exists to build. Both were bugs first, and both degraded to query
  while blaming the client record, so the boundary there now reports its own cause.
  Every unhonourable path config falls back to query and says which: no prefix on the record, or a
  page served outside it. That second is #92's blank widget in a new form — react-router's `Router`
  renders `null` on a basename miss, silently — which is why the guard is ours, not its `basename`.

  **`file://` is explicitly not supported, and nothing may be built to accommodate it.** #161 added
  a `MemoryRouter` fallback to `main.tsx` for it and then removed it: with the sandbox case gone,
  `file://` was the branch's only remaining trigger, and a `file://` document has no origin the API
  will accept and no CORS, so the widget fails long before its router does. **A branch whose only
  case is a configuration we do not support is never exercised and never right.** Reach for the
  same reasoning before adding insurance for any other unsupported host.
  ⚠ **The trap the history exists to avoid**: `Router` defaults `location.key` to a constant, so a
  history that doesn't mint one per entry collapses every `rememberCamera(location.key)` snapshot
  into a single bucket — back-navigation restores the wrong viewport, and nothing else in the app
  reads `key`, so every other test stays green. `routing.router.test.tsx` asserts distinct keys.
  (The basename-miss failure of #92 is **not** reachable here: query routing passes no `basename`,
  so `stripBasename` is never called. It becomes live again if `path` mode ever ships.)

- **Ask, don't infer.** Two questions, two answers, and neither is `window.location`:
  **"can this route be handed to somebody?"** is `useHrefFor()` (`src/config/routing.tsx`), which
  returns `undefined` in memory mode. **"is the route on screen in the URL?"** is `linkable` on
  `WidgetMode` (`src/config/mode.ts`), derived once from `mountDecision`.
  **Never put `window.location.href` in front of a viewer.** For an event, ask
  `useShareUrl(event.webUrl, event.path)` (over the pure `shareableUrl` in `src/lib/url.ts`): the
  canonical page wins in every mode, the event's OWN widget URL stands in otherwise, and
  `undefined` means there is honestly no link — the caller then renders no share block rather than
  the host page's address, which names their article and not the meditation. Resolving the event's
  route rather than the address bar is what stopped a share of the share drawer (#115 finding 3).
  `ShareContent.url` stays required for that reason; `RegistrationForm.eventUrl` is optional and
  drops its invite block.
  The `<Link>`-href consequence #92 recorded is **fixed** wherever the route is in a URL, because
  `createHref` returns an absolute host-origin URL. It survives only in memory mode.
- **One `<sahaj-atlas>` per page.** A second element is refused in `connectedCallback` and
  never mounts, because the API key (`config/api/auth`) and BrandTheme's theme root are
  page-global singletons a second instance would silently share. A second copy of the embed
  _script_ is a no-op too (`customElements.get` guard). Both say so via
  `reportIntegrationWarning` (`src/lib/report.ts`).
- Don't assume control of `<head>`, global CSS, or the full viewport — the host
  page owns those. Scope styles to the widget's own DOM.
- **The one thing the widget writes onto the host's own `<html>` is the readiness marker**
  (`data-sahaj-atlas-ready`, `src/lib/readiness.ts`, issue #153), and it is an exception
  argued rather than assumed: SahajCloud verifies an embed by loading the host page through
  Cloudflare Browser Rendering and reading the DOM back, so the evidence has to be findable
  from the top of the document — our scoped wrapper is not somewhere a verifier can be asked
  to look. Two properties make it honest, and both are load-bearing. It is published **only
  after React commits** (a mount effect in `Widget.tsx`, guarded on the theme-root ref), because
  a marker written on script load attests to a page whose widget may never have rendered and
  makes verification theatre. And it is **removed with page-global ownership**
  (`releaseAnnouncement`), so it cannot outlive the widget it vouches for on a host SPA that
  unmounted it. It attests the routing the router _actually_ uses — `MountDecision.routing`,
  not the `routing` parameter somebody configured, which is accepted without being honoured.
  A `postMessage` was rejected: the Browser Rendering API returns DOM with no message channel,
  and an injected listener races the widget's boot, which fails **healthy** sites.
- **What a host can observe is documented in `docs/embedding.md`** — the attribute table,
  the CSP contract, sizing, the URL shape, the style-tag ids. It is the only doc an
  embedding site reads, so a change here that a host could notice is not finished until
  that guide (and `CHANGELOG.md`) says so. The CSP table is the easiest one to break
  silently: a new origin, a new `<style>` injection, or a worker means a host's policy has
  to grow, and they find out by their page going blank rather than by our build failing.
- Provider stack lives in `src/providers.tsx` (React Query + Helmet + theme).
  Add new context providers there, not scattered across the tree.

## Responsive: which signal answers which question (issue #107)

The widget is embedded in layouts we don't own, so **"how big is the screen" and "how big
are we" are different questions**, and most of the app wants the second. Every responsive
decision names one of three signals (`src/config/responsive.ts`):

- **container** — `useIsWide(element)` in `DrawerStack`, which owns the measurement, and
  `useIsWideWidget()` for descendants reading it back off `WidgetWidthContext`.
- **viewport** — `useIsWideViewport()`. Only where the screen genuinely is the question.
- **input** — `useCoarsePointer()`. For affordances that depend on the device.

**Reaching for the wrong one fails silently**, which is why `src/config/responsive.test.ts`
asserts the viewport call sites as a closed list, the way `href.test.ts` pins the app's three
JSX anchors. A fourth turns the unit lane red rather than shipping a narrow embed that
quietly behaves like a desktop.

| Behaviour                                                                           | Signal                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawer direction — left panel vs bottom sheet (`DrawerStack`)                       | **container** (the map-less root, or the frame) | A fit question: does a 22rem side panel leave usable space beside it? Map mode used to have nothing to measure; since #169 it has a **frame** where one exists — a contained embed's box, or the compact card's expanded dialog — and the panel is inside it.                                                                                                                                                                                                                                                                                                                    |
| Drag handle · swipe-dismiss · `handleOnly` · the snap ladder                        | **container** (follows direction)               | The handle exists _iff_ the sheet is a bottom sheet. One signal is what stops a handle-less panel being draggable, or a sheet losing its handle. **The handle is passed explicitly by `DrawerStack`, not left to the atom's default** — that default is `direction === 'bottom' && mode !== 'filled'`, which was right while `filled` could only be the wide left panel, and would now leave a narrow map-less sheet drag-dismissible with nothing on screen saying so. It keys on dismissibility, so the map-less root (`dismissible={false}`) still shows none.                |
| Filter-overlay direction (right vs bottom)                                          | **container**                                   | Same panel-vs-sheet question, same answer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sticky Register bar (`EventView`)                                                   | **container**                                   | It exists because a snap sheet can scroll the CTA out of sight. That is a property of the sheet, so it must agree with whatever picked the sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Contact — `tel:` vs number + copy popover (`EventActions`)                          | **input**                                       | Whether `tel:` reaches a dialer is hardware. Narrowing a desktop window has never given it one, and a phone in landscape can be wider than any crossing we'd pick. **The one place the ticket's "narrow ⇒ mobile" reading is wrong**, and the reason the table exists.                                                                                                                                                                                                                                                                                                           |
| Map camera padding (`use-map-controller`)                                           | **container** (the frame)                       | It pads the camera around the panel, so it must agree with whatever picked that panel. Until #169 the viewport WAS that box by construction — map mode spanned it — so reading the viewport agreed by luck of the crossing being shared; a contained 600px map breaks the equality, getting a bottom sheet while a viewport read still reserves 22rem of camera for a panel that is not there. It is structurally out of reach of `WidgetWidthContext` (it renders `DrawerStack`), so both read `frameElement()` — `null`, and therefore the viewport, wherever no frame exists. |
| Anchored-panel geometry — `lg:inset-y-4`, `lg:rounded-2xl` (Drawer atom, PeekStrip) | **viewport (Tailwind) — accepted residue**      | Was "viewport == container wherever they apply". #169 falsified that: a >=768px CONTAINED map reaches them on a viewport its frame is not. What survives is cosmetic — the panel floats inset and rounds at a `lg:` crossing the frame never sees. The viewport UNITS beside them did not survive and are gone: `max-w-[calc(100%-2rem)]` now resolves against the containing block, like `--sy-frame-h`.                                                                                                                                                                        |
| SettingsMenu cog offset (`DrawerStack`)                                             | **container** (via `isWide`)                    | It clears the LEFT PANEL, so it must agree with whatever decided there is one — and #169 made that the frame's width. It was a `md:`/`lg:` variant, which in a 600px contained map pushed the cog 384px right for a panel that is not there, and past the edge of a 400px frame, where `overflow-hidden` clips it away. Outside a frame `isWide` IS the viewport's answer.                                                                                                                                                                                                       |
| Modal box sizing                                                                    | **container** (the frame)                       | Was "a modal is deliberately viewport-centred; it is not a citizen of the widget's slot". It is now: it portals through `overlayContainer()`, so a frame contains it and clips it. Both axes are measured against that box — height via `--sy-frame-h`, width via a plain `100%`, which on a fixed element already resolves against the containing block. `max-w-md` is 448px and a frame can be 360.                                                                                                                                                                            |
| `EventHeader`'s `md:pt-4`, `ListItem`'s `lg:h-9 lg:w-9`                             | **viewport (Tailwind) — accepted residue**      | The only two variants that fire _wrongly_ in a narrow map-less embed. Both cosmetic (12px of top padding; a 28→36px icon), and both in files #107 did not own. Fix them if you are in there anyway.                                                                                                                                                                                                                                                                                                                                                                              |
| Compact card vs the full interface (`AppShell`)                                     | **the slot, measured ONCE at mount**            | Not one of the three signals, and deliberately not reactive — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reduced motion, colour scheme                                                       | **preference**                                  | Not a size question at all — see the three motion seams above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Two properties of the mechanism are load-bearing:

- **The container signal is a strict generalization, not a behaviour change.** In map mode
  there is nothing to measure — the theme root is `display: contents`, the canvas is
  `position: fixed; inset: 0`, every drawer is `fixed` — so `useIsWide` falls through to the
  viewport and returns precisely what the old `useIsDesktop` did. Only map-less embeds, which
  _have_ a box, see a different answer. ⚠ **Since #169 a map embed can have one too** — a
  `MapFrame`, where the host sized the element — and then it is measured like any other box.
- **The first measurement is not damped; every later one is.** The seed runs in a layout
  effect, so the correct model is on screen from the first frame. Damping it too would paint
  a frame of the viewport's answer and then remount the drawer — the exact thrash the delay
  exists to prevent, fired on every mount instead of only on a resize.

### Map mode is contained by a FRAME, or it takes the viewport (issue #169)

**⚠ This section used to say containment was intractable. It is implemented; do not restore
that claim.** The argument was sound when written and every premise of it has since been
retired — which is the more useful thing to carry, because it is the shape of "a constraint
outlived its cause":

- vaul computed a snap-point sheet's translate from the **window** height, so a contained
  sheet was pushed off-screen by the library's own arithmetic → **its `container` prop is now
  passed** (`measureAgainst`, distinct from the portal target, which can be a `display: contents`
  element measuring 0×0);
- `--sy-sheet-top`, which pins the sticky Register bar and centres the fallback bodies, is a
  viewport-relative `getBoundingClientRect().top` → **the frame's own top is subtracted**, zero
  where there is no frame;
- every drawer, peek strip and cog is `position: fixed` and `100dvh` overshot → **`--sy-frame-h`**
  is `100dvh` on `.sy-atlas` and `100%` under `[data-sy-frame]`, which is right in both.

All three landed in #161 for the compact card's expanded dialog, so the mechanism was already
shipped and tested before #169 generalized it from "a modal dialog we own" to "any frame".

**The frame is `contain: layout`, and that one property does all of it.** It makes the element
the containing block for every fixed descendant, so the canvas, the drawers and the strips are
byte-identical in both modes — containment is emphatically NOT a `fixed` → `absolute` swap. It
also makes the frame a **stacking context**, which is the answer to "what is our z-index relative
to the host's": the widget's `z-30`…`z-50` stop competing with their CSS and their page orders
the atlas as one element. `lib/overlay.ts` holds the one reference (`setFrame`/`frameElement`),
and there is only ever one — see there for why.

⚠ **`contain: layout` still must not go on the scope root**, and the rule above is unchanged.
Same mechanism, opposite direction: on the root it would re-parent the fixed layer onto the
HOST's element, a box a map-less embed shares with their page. On `MapFrame` re-parenting is the
entire point and the element is ours.

**What decides it is whether the host sized the element, and nothing else** (`mapIsContained`).
Map mode renders everything fixed, so `<sahaj-atlas>` measures zero height on its own — a height
cannot appear by accident, it is a rule the host wrote, and it is the same rule `map=false` has
always asked for. That is what stops "contained map" and "compact card" both firing: a contained
map is container-relative, so it asks the floors question and never the viewport-ownership one.

An **unsized** map embed is unchanged: it fills the viewport, and one that does not have the page
to itself gets **a compact card instead of a takeover** — `lib/slot-decision.ts` measures at mount
and the card's button opens the map full-screen. It used to warn and then paint over their page
anyway, which is the weaker of the two answers by a distance.

### A slot too small for any layout: the compact card (issue #161)

#107 made the widget adapt to its box. Below a floor there is no layout left to adapt to, so the
widget stops trying and renders **`CompactEmbedView`** (`src/views/`) — a compact card — a heading and one task-named button that
opens the interface somewhere it fits.

- **ONE question, not three, and that is a correction.** The first implementation had
  `mapSlotWarning`, `embedForm` and `compactFit`, each with its own constants, over one
  measurement — and the wiring between them suppressed the map warning in exactly the case where
  the takeover was real. Every predicate was exhaustively specced; the _join_ was wrong. What
  survives is the question underneath all three: **is the space we have meaningfully smaller than
  the space the button would take the visitor to?** That needs two boxes, because "too small" is
  meaningless alone — 360px is cramped inside a 1440px page and is simply the screen on a phone.
  `resolveDestination` answers where the button goes; `embedLayout` answers what to render; both
  are pure and both are driven through `decideSlot` (`lib/slot-decision.ts`), which is the
  exported join **because the join is where the bug was**.
- **The destination discriminator is NOT "am I framed", though it looks like it should be.** It
  is whether the local viewport is bigger than the slot; framing only picks the fallback when it
  is not. Two cases make that concrete. A web component inside a _generously sized_ iframe — page
  builders and CMS previews produce these — would otherwise be sent off-site while a 1200×800
  overlay sat available. And **a frame IS a viewport**: `position: fixed` resolves against it and
  `window.innerHeight` is its height, so a framed map embed at 400×600 satisfies every argument
  behind "map mode needs a full-page slot" and must stay full.
- **`SLOT_GAIN` is one ratio where there were three**, and 0.8 is not a midpoint. It preserves the
  old `BOXED_SLOT_RATIO` boundary to the pixel, converts a 1000px map column that was silent
  before, and fixes a live false positive at 0.9 where a normally padded phone layout degraded a
  working map-less embed. Ratcheted in **both** directions.
- **`hasMap` changes the question, not just the answer** — and since #169 `contained` changes it
  again. An UNBOXED map embed fills the viewport, so for it the whole question is whether it owns
  one. Map-less is container-relative by design and is happy in a box, so it needs the absolute
  floors as well. A CONTAINED map is container-relative too, so it drops out of the ownership rule
  entirely and asks only the floors — which is precisely what keeps the two answers from fighting.
  A host CAN still size a map embed into a box no interface fits, and that is a card; `decideSlot`
  reconciles the pair in one place rather than trusting them not to collide.
- **`AppShell` owns the decision, above `MapProvider`, and nothing else can.** It is the only
  component above the map subtree, so it is the only place from which the whole of it can be left
  unmounted — which is what keeps mapbox-gl unfetched. The interface is passed to the surface as
  `children`, so React never renders it until the surface opens. That saving is **invisible to
  `pnpm size` by design**: the gate budgets the eager graph, and mapbox-gl is a dynamic import
  that was never in it.
- **The measurement happens once, on the first render.** Not on resize: switching remounts the
  widget and discards the in-widget history and the drawer stack, so a host page animating a
  sidebar would throw a visitor's session away mid-read. **There is deliberately no override
  parameter** — `compact` was one, documented to hosts and read by nothing, and a knob for a
  measurement we can get right is a permanent edge case traded for a bug we would rather fix.
  `DrawerStack`'s own `useIsWide(container)` is untouched: wide-vs-narrow and compact-vs-full are
  different questions asked of the same box.
- **The card is the button, and makes no data requests.** Preview rows were sized by a per-row
  pixel estimate that a wrapped title, a long locale or a larger default font made wrong, and
  cost a feed read, a titles read and a third-party IP lookup on every page view of a sidebar
  embed nobody scrolls to. `CompactEmbedView.test.tsx` asserts their ABSENCE so they cannot creep back.
- **Expansion goes through a seam** (`src/hooks/use-expansion.tsx`), the same shape as
  `MapController`. There is deliberately **no framed provider**: a frame cannot expand, so a
  framed embed gets an anchor (`lib/fallback-url.ts`) rendered through the `Button` atom's href
  form — not a new JSX anchor, because `href.test.ts` pins that inventory to three components.
- **What it expands into is a module-private dialog inside `CompactEmbedView`, which keeps a margin.**
  It was briefly a `Dialog` atom, and that was wrong twice over: it sat beside `Modal` doing what
  looked like the same job, and the one that looked generic was not — it publishes itself as the
  app's portal target, it needs `contain: layout` because _this_ app's interface is fixed
  throughout, and it had exactly one caller. Atoms stay primitive and single-use compositions are
  inlined in their one parent; both rules are above. `Modal` is now unambiguously the dialog
  atom — small, centred, chrome-ful, generic. A full-bleed `inset: 0`
  layer reads as a navigation — the host's page simply gone — so the dialog insets and the page
  shows through, and clicking that margin closes it. ⚠ **`contain: layout` on the dialog content
  is what makes the margin possible**: everything inside is `position: fixed`, and a fixed
  descendant resolves against the viewport unless an ancestor establishes a containing block, so
  without it the map and every drawer escape the margin and paint to the screen edge. Measured
  in Chrome 151 — a `fixed; inset: 0` child of a `fixed; inset: 16px` parent lands at 0,0
  plain and at 16,16 under `contain: layout`. That is the same property this rule forbids on the
  SCOPE ROOT, for the same mechanism pointed the other way; do not move it up the tree.
- **A deep link loads eagerly and opens; a configured default does not.** The distinction is
  whether the **page** URL carried `?atlas=`, surfaced as `routeFromPage` in the loader and
  `MountDecision.fromPage` in the widget — one signal feeding both, so they cannot disagree.
  Eager-loading is not an optimisation: the loader lazy-mounts behind an `IntersectionObserver`,
  so without it a deep-linked widget would mount **mid-scroll** and slam a modal over the page.
  A module flag in the provider stops a remount reopening what a visitor closed.

⚠ **An effect in `AppShell` runs for a collapsed card too, and that produced four separate bugs.**
The shell renders for every embed, including one whose entire appearance is a single button — so
anything that writes the host's URL, fetches, injects a script or reports must mount with the
**interface** (`FullInterface`, or from `interfaceElement`), never with the shell. The four, each
found one at a time across two review rounds before the pattern was named:

| Fired from a collapsed card | Cost                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The home-region redirect    | `navigate` writes `?atlas=/nl` onto the HOST's URL; reloading that address then opened a dialog nobody asked for |
| `api.warmCaches()`          | The whole events feed **and** the region tree, on every page view of a sidebar nobody presses                    |
| `Fathom.load`               | Our tracker script injected into the host's page                                                                 |
| `Fathom.trackPageview`      | A pageview of `/` recorded for an interface nobody opened                                                        |

**One property underwrites all four**: React never renders the card's `children` until the dialog
opens — which is also what keeps mapbox-gl unfetched. Nothing pinned it, and each fix has its own
spec that would keep passing if it broke, so it now has one of its own in
`CompactEmbedView.mount.test.tsx`. It has to be **jsdom**: the dialog's content is a portal, and
`renderToStaticMarkup` renders none, so the SSR version of that assertion is vacuous (see
`CLAUDE.md § Testing`).

Two effects deliberately still fire from a collapsed card — the readiness marker and the embed
report — because both attest that the widget _booted_, which is true whether or not anyone opened
it. `clients/me` stays too: the card is themed and localized from that record.

**Three things about the dialog were found in a browser and could not have been found any other
way.**

Escape never reaches the surface's own dialog: the drawer stack inside is vaul, which is Radix
Dialog underneath, so its dismissable layer is the topmost one and Radix delivers the key
there. Dismissing the drawer the viewer is looking at is right; doing _nothing_ once the stack
has nowhere left to go is not, because it leaves the collapse control as the only exit — and a
host can hide, confine or scroll that away, which locks a visitor onto a page they cannot
scroll or click. **The ladder is therefore finished in `DrawerStack`'s `onEscapeKeyDown`**,
which calls `useExpansion().collapse()` when the stack can neither dismiss nor collapse
further. `collapse()` is a no-op with no surface, so nothing else changes.

Radix's focus restore targets a `Dialog.Trigger` that deliberately does not exist here
(expansion is requested through the seam), so the surface records the opener itself — **scoped
to the widget root, not `document`**, because Safari and Firefox on macOS do not focus a
`<button>` on click, and a document-wide recorder would have collapse steal focus to whatever
the HOST had focused earlier. It also skips anything inside its own subtree, since the dialog's
mount focus fires while that listener is still attached.

And the third: **the dialog keeps a margin, and clicking it closes** — which is what retired the
machinery that used to guard this. An earlier full-bleed version watched its own box with a
`ResizeObserver` (`surfaceCoversPage`) and closed itself when it stopped covering the viewport,
because the × was then the only exit and a host can hide, confine or scroll that away. With an
outside to click and Escape reaching the ladder above, there are two exits Radix maintains for
free, so a confined dialog is a cosmetic problem rather than a trap and the observer is gone.

⚠ **The margin means nothing inside the dialog may size itself off the viewport**, and four
things did. Every drawer, peek strip and sheet is `position: fixed`, so `100dvh` is only correct
while nothing has taken the containing block — and the dialog takes it, 16–32px short.

The fix is one token, `--sy-frame-h`: `100dvh` on `.sy-atlas`, `100%` on `[data-sy-frame]` —
which the dialog carries, and which `MapFrame` carries too since #169 (`data-sy-expanded` is now
the narrower, dialog-only marker, and keys only the Mapbox control-column nudge).
`100%` on a fixed child resolves against its containing block, which is the dialog there and the
viewport everywhere else, so one value is right in both places. The drawer heights and the
fallback `max-h` read it instead of naming `dvh`.

`--sy-sheet-top` needed the matching correction: it is written from
`getBoundingClientRect().top` — a VIEWPORT coordinate — and consumed as `top:` on fixed peek
strips and `bottom:` on the sticky Register bar, so the dialog's own top is subtracted from it
(zero everywhere else).

**vaul is handled by its own API, not a patch.** It measures `container` when given one and
`window.innerHeight` otherwise, so the Drawer atom forwards `container` to `Vaul.Root` — the same
element it portals into, so the box vaul measures can never differ from the box it renders in.
Verified with a real snap-point sheet in a contained 768px box at an 800px viewport: the sheet
computes 768px, not 800, and its peek is exactly the 80px snap.

⚠ **A host ancestor carrying `transform`, `filter`, `perspective`, `contain` or a `will-change`
naming one of them confines the surface to that element** — the measured table below, re-run for
this change. `container-type` is **not** on that list, however often it is claimed to be.

**Nothing detects this at runtime any more, and that is the settled answer rather than an
omission.** There used to be a `containingBlockProperty` predicate walking the ancestors at mount
to name the offending property, and before that a `ResizeObserver` (`surfaceCoversPage`) closing
the dialog when it stopped covering the page. Both are **deleted**, and neither is coming back:
the predicate was ~80 lines and a `getComputedStyle` walk that could only ever catch causes it
enumerated, and the observer existed because a full-bleed dialog whose × a host could hide left a
visitor trapped. The margin retired both — clicking outside and Escape are two exits Radix
maintains for free, so a confined dialog is a cosmetic problem rather than a trap.

⚠ Do not read the paragraph above as describing a guard that fires. It describes a consequence a
host may see and we do not report. If you find yourself citing `SURFACE_CONFINED_MESSAGE` or
`surfaceCoversPage`, neither exists — `grep` before relying on either.

### Why there is no `@tailwindcss/container-queries`

It was evaluated and rejected, for one reason: **there is no CSS-side case for it to serve.**
Every layout-critical Tailwind variant in the app is either in the map-mode anchored path,
where viewport == container, or cancelled outright by `filled` map-less. That second half is
measured, not assumed — at a 1440px viewport (so every `lg:` variant is live) a `filled`
drawer computes to `position: absolute`, `max-width: none`, `border-radius: 0`, and fills its
box to the pixel, so `fixed`, `w-[22rem]`, `max-w-[calc(100vw-2rem)]`, `lg:inset-y-4` and
`lg:rounded-2xl` all have no effect in the only mode that _has_ a container. The real cases
were behavioural, and a ResizeObserver covers those.

**A caution against a plausible-sounding reason that is FALSE.** It is widely repeated that
`container-type: inline-size` makes an element a containing block for `position: fixed`
descendants — which would matter enormously here, since the map canvas, every drawer, the
peek strips and the cog are all fixed. It was written into this rule on that belief and then
measured, in Chrome 151:

| host style                    | fixed child resolves against                  |
| ----------------------------- | --------------------------------------------- |
| `container-type: inline-size` | the **viewport** (1440×900) — no re-parenting |
| `container-type: size`        | the **viewport** (1440×900) — no re-parenting |
| `contain: layout`             | the **host** (400×200)                        |
| `transform: translateZ(0)`    | the **host** (400×200)                        |

So `container-type` is _not_ the hazard; `contain` and `transform` are. If a genuine CSS-side
case ever appears, adopting the plugin is not blocked by this — but keep `contain: layout`
and any transform off every ancestor of the fixed layer, and re-measure rather than trusting
either this table or the folklore it corrects.

## Structure

- Components are grouped by atomic tier — `src/components/{atoms,molecules,organisms}/`
  — each component in its own **PascalCase folder** (`Chip/Chip.tsx` + stories +
  `index.ts`), with a barrel `index.ts` per tier (the `Icons/` and `Mapbox/`
  sub-modules group several files); `src/views/` holds the route screens. App code
  imports from the tier barrels; components import each other by component-folder
  path. See `DESIGN_SYSTEM.md`.
- **Explicit named exports — no `export *`.** Every component and tier barrel
  lists exactly what it surfaces: the primary component(s) + the `<Name>Props`
  type. Single-use internals (private modals, row primitives, helper sub-cards)
  are **not** exported — keep them module-private. The only wildcard left is the
  `Icons/` icon-set module. See the export rules + exception list in `DESIGN_SYSTEM.md`.
- **Atoms stay primitive.** No time/date/domain logic in an atom — put pure
  domain helpers in `src/lib/` (e.g. `isSoon`) and keep single-use compositions
  inlined in their one parent.
- Keep components presentational where possible; pull data via hooks
  (`src/hooks/`) and React Query (`src/config/api`), and read shared state from
  zustand selectors. See `src/config/api/CLAUDE.md` and
  `src/config/CLAUDE.md`.
- **A row in a list that grows should not subscribe to the URL.** `EventListItem` is the
  repo's one `React.memo`, because the search results list pages to hundreds of rows and
  would otherwise re-render all of them per press. `memo` only holds if the card takes
  what it needs as props: it reads the searched place from a prop rather than
  `useSearchParams`, since `?q` is rewritten on every geocoder keystroke and router
  context bypasses `memo` entirely.

## Rendering an anchor

**Don't render a bare `<a href={…}>`.** Use the `Link` atom; if a component genuinely must
emit its own anchor, its href goes through **`isSafeHref`** (`src/lib/shape/href.ts`) first —
`safePath`-clean or an allowed scheme — and a refusal reports via `reportInternalError` and
degrades to inert content. Exactly three components render a JSX anchor (`Link`, `Button`'s
href form, `ActionRow`'s `ActionCircle`), and `src/lib/shape/href.test.ts` **asserts** that
inventory, so a fourth turns the unit lane red until it is gated.

Why it is a shared predicate and not a check per component — including the two properties that
were each lost and restored, and why "site-relative" must be `safePath` rather than
`startsWith('/')` — is in `src/config/api/CLAUDE.md` → "Server-provided routes are untrusted
until `safePath`". That rule is path-scoped to the data layer, so it does not auto-load here;
read it before touching an anchor.

## Accessibility

`jsx-a11y` is enabled. Pair `onClick` on non-button elements with keyboard
handlers (or use a real `<button>` / our `Button` atom), and provide `alt`/ARIA
labels. The lint warns; don't ignore it on interactive elements.

**Motion needs a way out** (WCAG 2.2.2, issue #104). Anything that moves on its own for
more than five seconds needs a visible, keyboard-operable control to stop it, and must
not move at all under `prefers-reduced-motion: reduce` — read via
**`usePrefersReducedMotion`** (`src/hooks/use-reduced-motion.ts`), which is live, not a
one-shot read at mount. The image carousel is the worked example: the control is a toggle
button whose accessible name stays PUT while `aria-pressed` carries the state (a name
flipping "Pause"/"Play" beside `aria-pressed` announces the state twice and contradicts
itself), and it renders only when the thing actually autoplays — under reduced motion
there is nothing to pause, so the control is absent rather than inert.

**The rest of the app's motion is off under that preference too, through three seams —
one per animation technology, not one per component** (issue #102). Adding an animation
means checking which seam already covers it before reaching for a fourth:

- **framer-motion** — `MotionConfig` in `src/providers.tsx` covers every `motion.*` in
  the tree (the peek strips, the drawer cross-fade). It is driven by
  `usePrefersReducedMotion()`, NOT framer's own `reducedMotion="user"`: that reads the
  media query once at mount, so a viewer who flips the setting mid-session keeps the
  motion and then disagrees with the other two seams, which are live.
- **vaul's drawers** animate in CSS, so they are switched off in CSS — an additive
  `@media (prefers-reduced-motion: reduce)` block at the foot of `src/styles/vaul.css`,
  below the vendored upstream sheet. It has to kill BOTH `animation` (the slide
  keyframes) and `transition` (the inline transform the snap-point sheets ride);
  vaul's own `[data-vaul-animate='false']` hook only covers the first.
- **The map camera needs nothing, and adding it would be dead code.** mapbox-gl already
  short-circuits `flyTo` to `jumpTo`, zeroes `easeTo`'s duration, and reads the media
  query live — see the comment in `src/hooks/use-mapbox.ts` for the verification and for
  the two ways to break it (`respectPrefersReducedMotion: false`, or `essential: true`
  on a camera call).

**Forms announce their errors, once** (WCAG 4.1.3 / 3.3.1, issue #102). `FormField`'s
error span is `role="alert"` by default, which is what tells a viewer about the invalid
fields they are NOT focused on; the `aria-describedby` id covers the one they are. Focus
moves to the first invalid field via react-hook-form's own `shouldFocusError` — so a
custom form control must **forward a ref** to something focusable or RHF skips it in
silence (this is why `RadioGroup` is a `forwardRef`). Set `announceError={false}` on a
form that validates as the viewer types: a live region fires on the first character of an
email address, and such a form usually gates its submit on validity, so it has no failed
submit to announce anyway.

**Copy stays a prop, even for screen-reader-only text.** No atom calls `useTranslation` —
`Spinner`'s `srLabel` is the one that was tempted, and it defaults to English instead,
because a spinner renders in Suspense fallbacks that can run before the translation
bundles load (where `t()` returns the raw key) and because it would pull react-i18next
into the render path of every atom that composes it.

**A control on the drawer needs `data-vaul-no-drag`.** vaul reads a tap carrying any
micro-movement as a drag and swallows the click, so a control without it fires only
intermittently on touch. The `Button` atom sets it for you; anything hand-rolled
(`ActionRow`, the carousel's pause button) has to carry it itself.
