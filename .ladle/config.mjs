import { fileURLToPath } from 'url'

/**
 * Ladle configuration. Isolated component previews for the Sahaj Atlas widget.
 * See DESIGN_SYSTEM.md and STORYBOOK.md for taxonomy and story conventions.
 *
 * @type {import('@ladle/react').UserConfig}
 */
export default {
  stories: 'src/**/*.stories.{ts,tsx}',
  // Point Ladle at its own dedicated Vite config. Without this line,
  // Ladle auto-discovers the root vite.config.ts instead. That config's
  // multi-entry `rollupOptions.input` (index.html and Widget.tsx) and its
  // css-injected-by-js plugin would break the isolated build.
  viteConfig: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  port: 61000,
  previewPort: 61001,
  title: 'Sahaj Atlas Component Library',
  // Alphabetical, as Ladle sorts by default, but the whole widget's story last: it is the
  // assembled product, below the parts it is built from. The sidebar keeps this order.
  storyOrder: (stories) => [
    ...stories.filter((story) => !story.startsWith('interactive--')),
    ...stories.filter((story) => story.startsWith('interactive--')),
  ],
  hmr: true,
  base: '/',
  addons: {
    // Light/dark toggle. The decorator maps this control onto the
    // `dark` class. Tailwind (darkMode: 'class') reads that class.
    // Stories should look right in both states.
    theme: {
      enabled: true,
      defaultState: 'light',
    },
    source: {
      enabled: false,
    },
    ladle: {
      enabled: false,
    },
    rtl: {
      enabled: false,
    },
  },
}
