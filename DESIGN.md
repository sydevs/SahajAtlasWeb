---
name: Sahaj Atlas
description: Free Sahaja Yoga meditation classes on a warm, sunny map, embedded in host sites.
colors:
  primary-teal: "#1E6C71"
  primary-teal-deep: "#1A5C61"
  primary-teal-tint: "#E7F7F9"
  primary-teal-dark: "#5ECCD4"
  secondary-sky: "#A1C3D7"
  contrast-coral: "#E08E79"
  ornament-coral: "#C46C57"
  marker-green: "#30A47D"
  cluster-green: "#2E9E78"
  cluster-halo: "#9ED8C2"
  marker-coral: "#E0775C"
  cluster-coral: "#DD785D"
  cluster-coral-halo: "#F4B9A6"
  danger-red: "#E5484D"
  panel-warm-white: "hsl(40 60% 98.5%)"
  panel-dark: "hsl(0 0% 7%)"
  sand-2: "#F9F9F8"
  sand-3: "#F1F0EF"
  sand-4: "#E9E8E6"
  sand-6: "#DAD9D6"
  sand-7: "#CFCECA"
  sand-9: "#8D8D86"
  sand-11: "#63635E"
  sand-12: "#21201C"
  sand-dark-2: "#191918"
  sand-dark-3: "#222221"
  sand-dark-6: "#3B3A37"
  sand-dark-11: "#B5B3AD"
  sand-dark-12: "#EEEEEC"
  map-dark-land: "hsl(30, 12%, 21%)"
  map-dark-water: "hsl(193, 24%, 15%)"
  map-dark-label: "hsl(40, 30%, 88%)"
typography:
  headline:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.46667
  body-small:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.42857
  label:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.3px"
  group-label:
    fontFamily: "Atlas Rethink Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33333
    letterSpacing: "0.08em"
rounded:
  control: "8px"
  panel: "16px"
  pill: "9999px"
spacing:
  unit: "4px"
  gutter: "16px"
  row-y: "12px"
  row-min: "56px"
  panel-width: "352px"
  filters-width: "288px"
  content-max: "512px"
components:
  button-primary:
    backgroundColor: "{colors.primary-teal-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 24px"
  button-primary-dark:
    backgroundColor: "{colors.primary-teal-dark}"
    textColor: "#000000"
    rounded: "{rounded.control}"
  button-neutral-flat:
    backgroundColor: "{colors.sand-3}"
    textColor: "{colors.sand-12}"
    rounded: "{rounded.control}"
    height: "40px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.sand-12}"
    rounded: "{rounded.control}"
    height: "44px"
  chip-tag:
    backgroundColor: "{colors.primary-teal-tint}"
    textColor: "{colors.primary-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  list-row:
    textColor: "{colors.sand-12}"
    typography: "{typography.title}"
    height: "{spacing.row-min}"
    padding: "12px 16px"
  panel:
    backgroundColor: "{colors.panel-warm-white}"
    textColor: "{colors.sand-12}"
    rounded: "{rounded.panel}"
    width: "{spacing.panel-width}"
  filters-panel:
    backgroundColor: "{colors.panel-warm-white}"
    rounded: "{rounded.panel}"
    width: "{spacing.filters-width}"
---

# Design System: Sahaj Atlas

## Overview

**Creative North Star: "A Friend Who Meditates"**

Sahaj Atlas is a bright, sunny map with a warm white panel beside it (a bottom sheet on a phone). It belongs to the We Meditate family and lives inside other people's websites, so it has to feel welcoming without taking over the page. The warmth comes from colour, never from decoration: sand neutrals instead of blue-grey, a cream panel instead of paper white, green map markers, and one coral accent. The interface is quiet so that the one answer a seeker came for (when and where can I go) stands out.

Density is calm and list-shaped. Every panel row shares one 16px edge and one row height, text sits on one short type ladder, and the search field is the first thing under the title. Dark mode follows the device and keeps the same warmth: a sand-dark ramp and a warm taupe basemap instead of the stock blue-black.

The approved round-2 look rejected, by name: gradients and washes (a watercolour header was withdrawn), a greyed "quiet" map, dark-teal or high-contrast cluster markers, a single flattened chip style, and a set of decorative We Meditate icons.

**Key Characteristics:**
- Warm through colour, not decoration.
- Bright, sunny light basemap; warm taupe dark basemap.
- Green pins and clusters with white counts; coral marks the chosen class.
- One decorative icon in the whole interface: the We Meditate meditating figure.
- Search first: the place search sits at the top of the home panel, under the title.
- Host brand colours repaint every brand role, so meaning never depends on one fixed hue.

## Colors

A warm-neutral palette: sand greys and a cream panel carry the mood, a deep teal carries action, and coral is kept for the few things that should feel personal.

### Primary
- **We Meditate Teal** (primary-teal): the brand solid. Focus rings, links in host-authored text, the solid Near me state, the bounds line on the map. It is a host-repaintable role: a host's `color1` replaces the whole 12-step ramp at runtime.
- **Deep Teal** (primary-teal-deep): the background of solid buttons in light mode (Register for free), with white text. Hover lifts one step lighter.
- **Teal Tint** (primary-teal-tint): the soft fill behind teal tags and the hover wash on list rows (one step lighter on hover, one deeper when pressed).
- **Dark-Mode Teal** (primary-teal-dark): the solid in dark mode, with black text.

### Secondary
- **Sky** (secondary-sky): the language tag (ENGLISH) and other secondary tints. Host-repaintable.

### Tertiary
- **We Meditate Coral** (contrast-coral): the app's coral. Drives the selected pin, the selected cluster, the "today" tag, and the ornament colour. Host-repaintable.
- **Ornament Coral** (ornament-coral): the coral mixed toward its deep step so the meditating figure clears 3:1 on the light panel. Dark mode uses the coral solid itself.

### Map
- **Marker Green** (marker-green) and **Cluster Green** (cluster-green, inside a **Cluster Halo** ring at 70% opacity): unbranded pins and clusters, identical in light and dark. The cluster disc is one step deeper than the old Studio art so its bold white 12px count reaches 3.3:1.
- **Marker Coral** (marker-coral) and **Cluster Coral** (cluster-coral, halo cluster-coral-halo): the selected pin and selected area.
- **Dark Basemap** (map-dark-land, map-dark-water, map-dark-label): taupe land, deep teal-ink water, cream labels, painted over the dark Studio style on every style load. The light Studio style is left exactly as it is: cream land, sky-blue water, soft green parks.
- With a host palette, pins and clusters take the host's primary solid and the selection takes its contrast solid; the halo is derived from the fill.

### Neutral
- **Warm White** (panel-warm-white): the panel surface in light mode, like the We Meditate app's cream. Body text keeps 15.9:1 on it, secondary text 5.9:1.
- **Night Panel** (panel-dark): the panel surface in dark mode.
- **Sand ramp** (sand-2 to sand-12, light; sand-dark-*, dark): Radix sand, aliased under the app's `gray-*` names. sand-12 is body text, sand-11 secondary text and group labels, sand-9 chevrons, sand-6 dividers and panel borders, sand-7 input borders, sand-3 neutral fills, sand-2 inset cards.
- **Danger Red** (danger-red): errors only. A fixed status hue that no host palette overrides.

### Named Rules
**The Warm-Through-Colour Rule.** Warmth comes from the sand neutrals, the cream panel, the green markers and the coral accent. Never from gradients, washes, textures or ornament.

**The Repaint Rule.** Primary, secondary and contrast are host roles and repaint at runtime. Never let a state or meaning depend on one of them alone; pair colour with text, weight or shape.

**The Coral Is Rare Rule.** Coral marks the chosen class on the map, the "today" tag and the meditating figure. Nothing else.

## Typography

**Body Font:** Atlas Rethink Sans (Rethink Sans for Latin, Raleway for Cyrillic, under one self-hosted family name), falling back to the system sans.

**Character:** One friendly, rounded grotesque for everything. Hierarchy comes from size and weight steps, never from a second family. A host may name its own loaded typeface through `--sy-font-sans`.

### Hierarchy
- **Headline** (600, 20px, 1.3, -0.2px): the view title at the top of each panel. It outranks every row below it.
- **Title** (600, 16px, 1.375): list-row labels on place rows and the online row, card titles.
- **Body** (400, 15px, 1.47): class facts, descriptions, the search input. The "when" line on a class is 500 in deep teal.
- **Body small** (400, 14px, 1.43): secondary lines, counts, subtitles, buttons (500), in sand-11 when secondary.
- **Label** (700, 12px, 0.3px tracking, uppercase via CSS): the tinted tags, such as WEEKLY CLASS and ENGLISH.
- **Group label** (500, 12px, 0.08em tracking, uppercase via CSS, sand-11): names a group of list rows ("Or browse by country"). The copy stays sentence case in the CMS.

### Named Rules
**The One Ladder Rule.** Sizes are 12, 14, 15, 16 and 20px, all in px (a host's root font size must not rescale the widget). No tracking on body text.

**The 16px Field Rule.** Inputs render at 16px on touch screens so iOS never zooms the host page; 14px only with a wide screen and a fine pointer.

## Layout

The map fills the frame. On a phone the panel is a bottom sheet with a 16px rounded top; on a tablet it is a flush side panel; from 1024px it floats 16px in from the top and left edge with the map showing around it.

- **Panel width:** 352px side panel (paired with the map's camera padding). Content inside any panel is capped at 512px and centred, so a wide map-less embed reads as a column.
- **Filters panel:** 288px wide, 16px from the map's right edge, opening by default on visits 1200px and wider. Near me is an outlined button inside it.
- **One edge:** every row in a panel (title, banner, search, online row, country rows, toolbar) starts and ends on the same 16px gutter.
- **Rows:** one row height, at least 56px, with 12px vertical padding; touch targets reach 44px on coarse pointers even where the drawn control is smaller.
- **Rhythm:** a 4px unit. The header has 16px above and 8px below.
- **Home order:** title, then the search field, then near me, the online row, a group label, and the country list.
- **Phone filters sheet:** only as tall as its content.
- **World view:** shows the world once, filling the map.

**The One Edge Rule.** Nothing in a panel invents its own inset. If a row does not start at 16px, it is wrong.

## Elevation & Depth

Depth is light and structural: surfaces float over the map, nothing floats inside a panel. Panels, dialogs and the floating filters panel carry a soft, diffuse shadow plus a sand-6 hairline border. Inside a panel, depth is tonal: a sand-2 inset card, a sand-3 fill. A scrolled panel body shows a faint inset shadow under the header so the edge reads.

### Shadow Vocabulary
- **Panel float** (Tailwind `shadow-2xl`): the side panel, the bottom sheet, modals.
- **Overlay** (`shadow-xl`): the filters panel, menus, select and combobox popovers.
- **Map control** (`shadow-md` to `shadow-lg`): the filter chip bar, round map buttons, the pin-hover popover.
- **Scroll edge** (`inset 0 7px 6px -7px rgb(0 0 0 / 0.25)`): appears only once the panel body has scrolled.

**The Float Over The Map Rule.** Shadows exist to lift a surface off the map. A card inside a panel never gets one.

## Shapes

Gently rounded, one rule:

- **Panels** (16px): side panel, sheet top, filters panel, modals, menus.
- **Everything inside a panel** (8px): buttons, inputs, cards, tags, rows, popovers.
- **Pills** (fully round): the map's filter chips, active-filter pills, count badges, round icon buttons, country flags.

The checkbox is the one exception and keeps its own shape. Map pins are teardrops with a white centre dot; clusters are discs inside a translucent halo.

**The Two Corners Rule.** 16px for a surface on the map, 8px for anything on that surface, round only for pills. No 2, 4 or 6px corners.

Note: this radius rule ships in the combined build (`ux/all-proposals`). On `ux/style-warm` alone the older scale still stands (4px controls, 12px panels).

## Components

### Buttons
- **Shape:** 8px corners; heights 32, 40 and 48px.
- **Primary (Register for free):** full width, 48px, deep teal with white text in light mode; dark-mode teal with black text in dark mode. Hover steps the shade.
- **Neutral flat:** sand-3 fill with sand-12 text, for the second-choice action.
- **Outlined:** a 1px sand-6 border on a transparent fill with sand-12 text, 44px tall; Near me in the filters panel. It turns solid teal once near me is on.
- **Ghost:** no surface until hovered; header and toolbar controls recede.
- **Focus:** a 2px ring in the brand solid, on every control.

### Class actions
Directions, Call and Share sit in one row of equal-width, 44px buttons, apart from Register, in one shared style: an 18px line icon in the teal deep step beside a short 14px label (stacked icon over label when four actions share the row). Register is the only solid button on a class page.

### Tags (Chips)
- **Style:** 12px bold uppercase, tracked 0.3px, on the role's soft tint with the role's deep text: teal for the class type, sky for the language, sand for full, coral for today.
- **Removable:** active-filter pills are round and carry a close button with a 44px touch area.

### List rows
- **Style:** a 56px row on the 16px gutter, a 24px leading slot (country flag or the meditating figure), the label, a tabular count in sand-11, and a sand-9 chevron. Dividers live on the list, not the row.
- **States:** teal-tint wash on hover, one step deeper when pressed; in dark mode a sand wash.
- **Quiet variant:** country rows use the 15px body weight so the list does not shout.

### Panels and sheets
Warm white surface, sand-6 hairline border, panel float shadow, 16px corners when floating. A sand-7 drag handle on phone sheets. Back sits apart from the view title.

### Search field
The Mapbox place search, themed to the widget: warm white field, sand-7 1px border, 8px corners, sand-11 placeholder, sand-3 hover in suggestions, the brand solid for focus.

### Map markers
App-owned SVG art, rasterised at 2x: green teardrop pins and halo clusters with bold white counts, coral for the selected class and area, a 30% tinted dot with a solid ring for a class with no exact location (never a precise pin). Hovering a pin shows a small popover card with the class's timing line.

### The meditating figure
The We Meditate app's meditating figure, at 24px in ornament coral, on the "Online classes" row. It is the only decorative icon. All other icons are functional lucide line icons (chevrons, close, filter, phone, directions, share).

## Do's and Don'ts

### Do:
- **Do** take every neutral from the sand ramp through the `gray-*` names, and every brand colour from the role ramps, so hosts can repaint them.
- **Do** keep every panel row on the 16px gutter and the 56px row height.
- **Do** use the type ladder (12, 14, 15, 16, 20px) in px, with sentence-case copy and uppercase only through CSS.
- **Do** keep the search field first on the home panel, under the title.
- **Do** keep the light basemap bright and sunny, and apply the warm paint to the dark one.
- **Do** keep coral for the selected class, the today tag and the meditating figure.
- **Do** hold 4.5:1 for body text and 3:1 for icons and large text, on both the warm white and the night panel.

### Don't:
- **Don't** use gradients, washes, watercolour, textures or decorative illustration.
- **Don't** add decorative icons. The meditating figure on the online row is the only one; the near-me row has no icon.
- **Don't** grey out the map or recolour clusters dark teal.
- **Don't** flatten the tags into one neutral style; each keeps its tinted role colour.
- **Don't** use corners other than 16px, 8px and fully round.
- **Don't** put a group label above a title or heading; it names a group of rows, nothing else.
- **Don't** use rem units; a host's root font size would rescale the widget.
