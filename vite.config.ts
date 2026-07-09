import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin({
      styleId: 'sahaj-atlas-style',
      relativeCSSInjection: true,
      dev: { enableDev: true },
    }),
    react(),
    tsconfigPaths(),
  ],
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        widget: './src/Widget.tsx',
      },
      output: {
        entryFileNames: (assetInfo) => {
          return assetInfo.name === 'widget' ? 'embed.js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
  /*experimental: {
    renderBuiltUrl(filename: string) {
      return "http://localhost:4173/" + filename;
    },
  },*/
})
