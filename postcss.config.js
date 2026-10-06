import tailwindcss from '@tailwindcss/postcss'

import scopeWidgetCss from './scripts/postcss-scope-widget.mjs'

// Plugin order matters. `scopeWidgetCss` runs last. By then it sees the
// finished stylesheet: Tailwind's generated Preflight and utilities, plus
// the third-party sheets Vite already inlined for globals.css's `@import`s
// (mapbox-gl, swiper, vaul, Radix Colors). `scopeWidgetCss` confines every
// rule to the widget's own DOM. See the header of
// scripts/postcss-scope-widget.mjs and issue #91.
//
// ⚠ Keep Tailwind on the PostCSS entry point. `@tailwindcss/vite` generates
// outside the PostCSS chain, so `scopeWidgetCss` would stop seeing the
// utilities it exists to confine — and `assert:css` is a post-build gate,
// so the leak would reach `dist/` before anything complained.
//
// `autoprefixer` is gone: v4 prefixes through lightningcss.
export default {
  plugins: [tailwindcss(), scopeWidgetCss()],
}
