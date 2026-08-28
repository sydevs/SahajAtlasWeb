export * from './brand'
export * from './socials'

// What is LEFT here after the Lucide swap: brand marks only.
//
// The interface glyphs now come from `lucide-react`, imported directly at each call site
// — one grid (24px), one stroke weight (2px), round caps and joins, outline only. Lucide
// draws with `stroke="currentColor"` and sets `aria-hidden="true"` itself, so the two
// contracts the old `BaseIcon` provided survive the swap without a wrapper.
//
// These do not move, because Lucide has no brand icons and redrawing them is a trademark
// problem: the Sahaja Yoga `Logo`, and the three online-meeting platform glyphs behind
// `SocialIcon` (Zoom / Google Meet / YouTube). The social SHARE networks left this module
// long ago — react-share renders its own (#61).
//
// ⚠ RTL mirroring is now per call site. `BaseIcon`'s `flipRtl` used to carry it centrally
// for the two directional glyphs; with the swap, every directional usage declares
// `rtl:-scale-x-100` itself — the drill-in chevrons (ListItem, SettingsMenu, the calendar's
// month arrows) and the directions signpost (EventActions). Symmetric glyphs (globe, calendar,
// share, pin) never mirror, and neither does the external-link ↗, whose convention is
// direction-agnostic. When adding a directional icon, add the class.
