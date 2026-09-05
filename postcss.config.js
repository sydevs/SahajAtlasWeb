import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

import scopeWidgetCss from './scripts/postcss-scope-widget.mjs'

// Plugin order matters. `scopeWidgetCss` runs last. By then it sees the
// finished stylesheet: Tailwind's generated Preflight and utilities, plus
// the third-party sheets Vite already inlined for globals.css's `@import`s
// (mapbox-gl, swiper, vaul, Radix Colors). `scopeWidgetCss` confines every
// rule to the widget's own DOM. See the header of
// scripts/postcss-scope-widget.mjs and issue #91.
export default {
  plugins: [tailwindcss(), autoprefixer(), scopeWidgetCss()],
}
