// The drawer headers' shared geometry, in a leaf with no imports, so the boot panel
// (`views/loading.tsx`, in the eager graph) draws the same header the interface will, without
// carrying the controls, the map search or the router helpers that `shared.tsx` and `nav.tsx` do.

/**
 * The drawer header's icon controls (back, overlay close, calendar, search, filter) are all
 * the same Button preset, kept here as values, rather than as a wrapper component, so they
 * provably render identical chrome — the header reads as one set of buttons.
 */
export const HEADER_CONTROL = { variant: 'ghost', isIconOnly: true, size: 'sm' } as const

// On every header control, so whichever one ends the row takes it, whatever renders null after
// it. Its 20px icon sits centred in a 32px box (44px on a touch screen), so this pulls the box
// into the gutter until the icon lands on the panel edge, in the column of the rows' chevrons,
// with the tap area whole.
export const HEADER_EDGE = 'last:-me-1.5 pointer-coarse:last:-me-3'

/** The Back row. The bottom margin keeps Back from reading as part of the title below it. */
export const NAV_ROW = 'mb-2 flex min-h-8 items-center justify-between gap-1'

/** A header whose Back row sits above its title (`NavHeader`). */
export const NAV_HEADER = 'flex-col items-stretch gap-0'

/** The search field's slot in a header row. */
export const FIELD_SLOT = 'min-w-0 flex-1'

/** A drawer's title, and the muted line under it (`DrawerTitle`). */
export const TITLE = 'line-clamp-2 text-xl break-words'
export const SUBTITLE = 'truncate text-sm text-gray-11'
