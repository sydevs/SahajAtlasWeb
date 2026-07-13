// Themes the Mapbox Search JS Geocoder (used by MapSearch) to match the rest of
// the widget: it reads the project's brand CSS tokens instead of hardcoded
// colours, so the input + its suggestion dropdown follow light/dark mode and the
// tenant palette. Colours map to the same tokens Tailwind uses — the neutral
// ramp (`--gray-*`, dark-adaptive), the surface (`--background`), and the brand
// accent (`--primary-9`) — with the input border matching our form inputs
// (`gray-7`) and the default rounded corners.
export const controlTheme = {
  variables: {
    fontFamily:
      'Raleway, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    // Base font size for the input + suggestions (spacing derives from it); kept
    // small so the "Search for events near…" placeholder isn't truncated.
    unit: '14px',
    fontWeight: '500',
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
}
