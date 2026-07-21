export * from './actions'
export * from './socials'
export * from './symbols'
export * from './records'
// Source for new icons: https://icon-sets.iconify.design/
//
// RTL mirroring policy (issue #52): icons that encode reading/travel direction
// (DirectionsIcon, the chevron arrows) carry `rtl:-scale-x-100` so they flip
// when the widget root sets dir="rtl". Symmetric/object icons (phone, calendar,
// share, location pin) never mirror, and neither does the external-link anchor
// (the ↗ convention is direction-agnostic). When adding an icon, decide which
// bucket it belongs to and add the class only for genuinely directional art.
