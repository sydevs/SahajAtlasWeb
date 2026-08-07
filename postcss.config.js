import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

import scopeWidgetCss from './scripts/postcss-scope-widget.mjs'

// Order matters. `scopeWidgetCss` runs LAST so it sees the finished stylesheet:
// Tailwind's generated Preflight + utilities, and the third-party sheets Vite has
// already inlined for globals.css's `@import`s (mapbox-gl, swiper, vaul, Radix
// Colors). It confines every one of them to the widget's own DOM — see the header
// of scripts/postcss-scope-widget.mjs and issue #91.
export default {
  plugins: [tailwindcss(), autoprefixer(), scopeWidgetCss()],
}
