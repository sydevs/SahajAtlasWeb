import { fileURLToPath } from 'url'

/**
 * Ladle configuration. Isolated component previews for the Sahaj Atlas widget.
 * See DESIGN_SYSTEM.md and STORYBOOK.md for taxonomy and story conventions.
 *
 * @type {import('@ladle/react').UserConfig}
 */
export default {
  stories: 'src/**/*.stories.{ts,tsx}',
  // Point Ladle at its own dedicated Vite config. Without this line, Ladle
  // auto-discovers the root vite.config.ts instead. That config's
  // multi-entry `rollupOptions.input` (index.html and Widget.tsx) and its
  // css-injected-by-js plugin would break the isolated build.
  viteConfig: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  port: 61000,
  previewPort: 61001,
  title: 'Sahaj Atlas Component Library',
  hmr: true,
  base: '/',
  addons: {
    // Light/dark toggle. The decorator maps this control onto the `dark`
    // class. Tailwind (darkMode: 'class') reads that class. Stories should
    // look right in both states.
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
