import { FONT_FAMILY } from '@/styles/fonts'

// This themes the Mapbox Search JS Geocoder (used by MapSearch) to match the
// rest of the widget. It reads the project's brand CSS tokens instead of
// hardcoded colors, so the input and its suggestion dropdown follow
// light/dark mode and the tenant palette. Colors map to the same tokens
// Tailwind uses: the neutral ramp (`--gray-*`, dark-adaptive), the surface
// (`--background`), and the brand accent (`--primary-9`). The input border
// matches our form inputs (`gray-7`), with the default rounded corners.
// The geocoder styles itself with its own CSS-in-JS, so it cannot inherit
// our `font-sans`. The stack is restated here and built from FONT_FAMILY,
// so a rename of the self-hosted face cannot leave this one input in the
// fallback system sans (#91).
export const controlTheme = {
  variables: {
    fontFamily: `${FONT_FAMILY}, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
    // This is the base font size for the input and suggestions. Spacing
    // derives from it. It stays small, so the "Search for events near…"
    // placeholder is not truncated.
    unit: '15px',
    fontWeight: '400',
    padding: '1em',
    colorText: 'var(--gray-12)',
    colorSecondary: 'var(--gray-11)',
    colorBackground: 'hsl(var(--background))',
    colorBackgroundHover: 'var(--gray-3)',
    colorBackgroundActive: 'var(--gray-4)',
    colorPrimary: 'hsl(var(--primary-9))',
    border: '1px solid var(--gray-7)',
    borderRadius: '4px',
    boxShadow: 'none',
  },
  // The geocoder hardcodes three things its variables don't reach. Typed text is 75% black in
  // both themes, so `colorText` never touches it and it vanishes on a dark panel. Its focus state
  // is a dotted border. And its placeholder is 37% black, about 2.6:1 on white. These restate all
  // three in the tokens the rest of the panel uses, with the same 2px ring as `fieldChrome`.
  cssText: `
    .Input, .Input:focus { color: var(--gray-12); caret-color: var(--gray-12); }
    .Input:focus { border: 0; }
    .Input::placeholder { color: var(--gray-11); opacity: 1; }
    .Geocoder:focus-within { box-shadow: 0 0 0 2px hsl(var(--primary-9)); }
    .Results {
      min-width: var(--sy-results-w, 0);
      border-radius: 8px;
      overflow: hidden;
      /* The list sits 1px inside the field. The ring closes that gap, so no row's flag shows past it. */
      box-shadow: 0 0 0 1px hsl(var(--background)), 0 8px 24px rgb(0 0 0 / 0.16);
    }
  `,
}
