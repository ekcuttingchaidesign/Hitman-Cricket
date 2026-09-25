import { defineConfig } from 'vite';

/**
 * The career key's states, built to stand on its own.
 *
 * The same shape as the board preview's config and for the same reason: the
 * page is published somewhere that is not a site root, so every path is
 * relative, and the fonts travel inside the files rather than as requests to
 * an origin that will not serve them.
 *
 *   npx vite build -c vite.key-lab.config.ts
 */
export default defineConfig({
  root: 'tools',
  publicDir: false,
  base: './',
  logLevel: 'warn',
  define: { 'import.meta.env.VITE_SHOW_SURVIVE': '"1"' },
  build: {
    outDir: '../key-out',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 400_000,
    rollupOptions: { input: 'tools/key-widget-lab.html' },
  },
});
