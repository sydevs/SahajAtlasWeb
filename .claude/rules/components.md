---
description: React component patterns — Radix primitives, tailwind-variants, widget context.
globs:
  - "src/components/**/*.tsx"
  - "src/views/**/*.tsx"
  - "src/providers.tsx"
alwaysApply: false
---

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
   behaviour. Drawer (vaul) is the surface for anything that's a *place* in the
   URL-driven stack; Modal (Radix Dialog) is the ephemeral one that never touches
   the URL or history. Input/Textarea wrap the native controls on the shared
   `fieldChrome` recipe; `Combobox` is the search-in-the-field picker (Radix Popover
   + cmdk — the region filter), `Select` the plain list picker. Every form-control
   atom shares one error/active-state interface: **`isInvalid`** (danger visual +
   `aria-invalid`, with `aria-describedby` for the error text) and **`highlight`**
   (primary-tints the *unselected* state, no layout shift, to flag an active
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
- **Host-authored rich text** carries the `.colored-links` utility, which owns the
  whole treatment for that content — link colour AND `break-words`. One unbreakable
  run (a pasted URL, or the U+2800 braille blanks authors use as spacing) otherwise
  widens the scroll container and gives the drawer a horizontal scrollbar. The
  Drawer's body slot is `overflow-x-hidden` as a backstop, not as the fix.

## Widget / embedding constraints

This app ships as the `<sahaj-atlas>` custom element (`src/Widget.tsx`) embedded
in host pages, **and** runs standalone in dev. Because of that:

- Routing uses **HashRouter** with basename `!` — but only when the fragment is the
  widget's to take. `mountRoute` (`src/lib/shape/hash.ts`) decides that once at mount, and
  on a host URL already carrying an anchor (`#respond`, `#comment-123` — routine on
  WordPress) the widget mounts a **MemoryRouter** instead and never writes to the URL at
  all. It used to render blank there. Consequences worth knowing: on such a page the
  widget's route isn't linkable, Back leaves the host page, and `<Link>` hrefs resolve
  against the host origin (issue #92).
  Build links with `react-router` `<Link>` / `useNavigate`, never hardcode `#!` — and note
  the hash has **two** spellings, `#!/x` (what the widget writes at boot) and `#/!/x` (what
  react-router writes thereafter, having normalised the basename to `/!`).
- **One `<sahaj-atlas>` per page.** A second element is refused in `connectedCallback` and
  never mounts, because the API key (`config/api/auth`) and BrandTheme's theme root are
  page-global singletons a second instance would silently share. A second copy of the embed
  *script* is a no-op too (`customElements.get` guard). Both say so via
  `reportIntegrationWarning` (`src/lib/report.ts`).
- Don't assume control of `<head>`, global CSS, or the full viewport — the host
  page owns those. Scope styles to the widget's own DOM.
- Provider stack lives in `src/providers.tsx` (React Query + Helmet + theme).
  Add new context providers there, not scattered across the tree.

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
  zustand selectors. See `.claude/rules/data-layer.md` and
  `.claude/rules/i18n-and-state.md`.
- **A row in a list that grows should not subscribe to the URL.** `EventListItem` is the
  repo's one `React.memo`, because the search results list pages to hundreds of rows and
  would otherwise re-render all of them per press. `memo` only holds if the card takes
  what it needs as props: it reads the searched place from a prop rather than
  `useSearchParams`, since `?q` is rewritten on every geocoder keystroke and router
  context bypasses `memo` entirely.

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
