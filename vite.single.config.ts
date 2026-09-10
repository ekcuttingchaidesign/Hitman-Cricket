import { defineConfig } from 'vite';
// A one-file build of the game for preview hosting: every asset inlined as a
// data URI and no chunk splitting, so the page has nothing left to fetch.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
