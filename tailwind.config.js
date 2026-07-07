import defaultTheme from 'tailwindcss/defaultTheme'

// Brand roles (primary/secondary) read the runtime engine's 12-step channel vars
// (src/config/theme/palette.ts; defaulted in globals.css). `DEFAULT` is the solid
// (step 9) and `foreground` its on-color, so `bg-primary` / `text-primary` keep
// working alongside the full `primary-1…12` ramp.
const brandScale = (name) => ({
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, `hsl(var(--${name}-${i + 1}) / <alpha-value>)`]),
  ),
  DEFAULT: `hsl(var(--${name}-9) / <alpha-value>)`,
  foreground: `hsl(var(--${name}-contrast) / <alpha-value>)`,
})

// Radix Colors neutral/status ramps come in as solid hex vars (globals.css imports
// the Radix CSS), so they're referenced directly — no alpha channel.
const radixScale = (name) =>
  Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, `var(--${name}-${i + 1})`]))

const TAILWIND_REM_TO_PX = {
  borderRadius: {
    none: '0px',
    sm: '2px',
    DEFAULT: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    '2xl': '16px',
    '3xl': '24px',
    full: '9999px',
  },
  columns: {
    auto: 'auto',
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: '11',
    12: '12',
    '3xs': '256px',
    '2xs': '288px',
    xs: '320px',
    sm: '384px',
    md: '448px',
    lg: '512px',
    xl: '576px',
    '2xl': '672px',
    '3xl': '768px',
    '4xl': '896px',
    '5xl': '1024px',
    '6xl': '1152px',
    '7xl': '1280px',
  },
  fontSize: {
    xs: ['12px', { lineHeight: '16px' }],
    sm: ['14px', { lineHeight: '20px' }],
    base: ['16px', { lineHeight: '24px' }],
    lg: ['18px', { lineHeight: '28px' }],
    xl: ['20px', { lineHeight: '28px' }],
    '2xl': ['24px', { lineHeight: '32px' }],
    '3xl': ['30px', { lineHeight: '36px' }],
    '4xl': ['36px', { lineHeight: '36px' }],
    '5xl': ['48px', { lineHeight: '1' }],
    '6xl': ['60px', { lineHeight: '1' }],
    '7xl': ['72px', { lineHeight: '1' }],
    '8xl': ['96px', { lineHeight: '1' }],
    '9xl': ['144px', { lineHeight: '1' }],
  },
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
  },
  maxWidth: ({ theme, breakpoints }) => ({
    none: 'none',
    0: '0px',
    xs: '320px',
    sm: '384px',
    md: '448px',
    lg: '512px',
    xl: '576px',
    '2xl': '672px',
    '3xl': '768px',
    '4xl': '896px',
    '5xl': '1024px',
    '6xl': '1152px',
    '7xl': '1280px',
    full: '100%',
    min: 'min-content',
    max: 'max-content',
    fit: 'fit-content',
    prose: '65ch',
    ...breakpoints(theme('screens')),
  }),
  spacing: {
    px: '1px',
    0: '0',
    0.5: '2px',
    1: '4px',
    1.5: '6px',
    2: '8px',
    2.5: '10px',
    3: '12px',
    3.5: '14px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
    11: '44px',
    12: '48px',
    14: '56px',
    16: '64px',
    20: '80px',
    24: '96px',
    28: '112px',
    32: '128px',
    36: '144px',
    40: '160px',
    44: '176px',
    48: '192px',
    52: '208px',
    56: '224px',
    60: '240px',
    64: '256px',
    72: '288px',
    80: '320px',
    96: '384px',
  },
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    // Scan all of src so a directory rename can't silently drop utilities the way the
    // removed pages/ + layouts/ globs did — the drawer rework moved views into src/views/
    // and any class used *only* in a view (e.g. the RootView flag sizing) went ungenerated.
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './.ladle/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    ...TAILWIND_REM_TO_PX,
    extend: {
      // Semantic color tokens. Brand roles (primary/secondary) repaint at runtime
      // via the engine's CSS vars; neutral (gray) + status (danger) are fixed
      // Radix Colors ramps. `danger` is intentionally independent of the brand's
      // `secondary` — a fixed status hue, never tenant-overridden.
      colors: {
        gray: radixScale('gray'),
        primary: brandScale('primary'),
        secondary: brandScale('secondary'),
        danger: {
          ...radixScale('red'),
          DEFAULT: 'var(--red-9)',
          foreground: '#ffffff',
        },
        // Semantic aliases onto canonical steps, so common surfaces stay readable.
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'var(--gray-12)',
        divider: 'var(--gray-6)',
        focus: 'hsl(var(--primary-9))',
      },
      // NextUI's `opacity-hover` (0.8) / `opacity-disabled` (0.5) tokens, kept so
      // the existing hover/disabled utilities still resolve.
      opacity: {
        hover: '0.8',
        disabled: '0.5',
      },
    },
    fontSize: {
      xs: [
        '12px',
        {
          lineHeight: '1.66667',
          letterSpacing: '0.36px',
        },
      ],
      sm: [
        '13px',
        {
          lineHeight: '1.5',
          letterSpacing: '0.36px',
        },
      ],
      base: ['14px', '1.2'],
      md: ['14px', '1.2'],
      lg: [
        '17px',
        {
          lineHeight: '1.2',
          fontWeight: '600',
        },
      ],
      xl: [
        '20px',
        {
          lineHeight: '1.2',
          fontWeight: '600',
        },
      ],
      '2xl': [
        '30px',
        {
          lineHeight: '1.166667',
          letterSpacing: '0.8px',
        },
      ],
    },
    fontFamily: {
      sans: ['Raleway', ...defaultTheme.fontFamily.sans],
      serif: defaultTheme.fontFamily.serif,
      mono: defaultTheme.fontFamily.mono,
    },
    backgroundImage: {
      'circle-pattern': "url('/graphics/circle.svg')",
    },
  },
  darkMode: 'class',
  plugins: [],
}
