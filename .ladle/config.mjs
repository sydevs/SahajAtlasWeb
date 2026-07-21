import { fileURLToPath } from 'url'

/**
 * Ladle configuration — isolated component previews for the Sahaj Atlas widget.
 * See DESIGN_SYSTEM.md / STORYBOOK.md for taxonomy and story conventions.
 *
 * @type {import('@ladle/react').UserConfig}
 */
export default {
  stories: 'src/**/*.stories.{ts,tsx}',
  // Point Ladle at our dedicated Vite config. Without this, Ladle auto-discovers
  // the root vite.config.ts, whose multi-entry `rollupOptions.input` (index.html
  // + Widget.tsx) and css-injected-by-js plugin break the isolated build.
  viteConfig: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  port: 61000,
  previewPort: 61001,
  title: 'Sahaj Atlas Component Library',
  hmr: true,
  base: '/',
  addons: {
    // Light/dark toggle — the decorator maps this onto the `dark` class that
    // Tailwind (darkMode: 'class') and NextUI read. Stories should look right
    // in both states.
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
