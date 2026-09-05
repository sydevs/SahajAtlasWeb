export * from './brand'
export * from './socials'

// What is LEFT here after the Lucide swap: brand marks only.
//
// The interface glyphs now come from `lucide-react`, imported directly at
// each call site: one 24px grid, one 2px stroke weight, round caps and
// joins, outline only. Lucide draws with `stroke="currentColor"` and sets
// `aria-hidden="true"` itself. So the two contracts the old `BaseIcon`
// provided survive the swap without a wrapper.
//
// Two things do not move, because Lucide has no brand icons, and redrawing
// them is a trademark problem: the Sahaja Yoga `Logo`, and the three
// online-meeting platform glyphs behind `SocialIcon` (Zoom, Google Meet,
// YouTube). The social SHARE networks left this module long ago.
// react-share renders its own instead (#61).
//
// ⚠ RTL mirroring is now per call site. `BaseIcon`'s `flipRtl` used to carry
// it centrally for the two directional glyphs. With the swap, every
// directional usage declares `rtl:-scale-x-100` itself: the drill-in
// chevrons (ListItem, SettingsMenu, the calendar's month arrows), and the
// directions signpost (EventActions). Symmetric glyphs, such as globe,
// calendar, share, and pin, never mirror. Neither does the external-link ↗,
// whose convention stays direction-agnostic. When adding a directional icon,
// add the class.
