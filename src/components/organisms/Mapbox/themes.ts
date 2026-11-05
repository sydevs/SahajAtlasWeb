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
  // The geocoder's own placeholder is 37% black, about 2.6:1 on white. This lifts it
  // to the same secondary text the rest of the panel uses. Its typed text is a fixed 75% black,
  // which `colorText` does not reach, so it is set here or dark theme can't be read.
  cssText: `.Input, .Input:focus { color: var(--gray-12); } .Input::placeholder { color: var(--gray-11); opacity: 1; }`,
}
