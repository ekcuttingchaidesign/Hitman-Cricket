import { defineConfig } from 'vite';

/**
 * The leaderboard review page, built to stand on its own.
 *
 * Relative paths throughout, because it is published somewhere that is not a
 * site root, and a generous inline limit so the fonts and the artwork travel
 * inside the files rather than as a dozen requests that may not be served.
 *
 *   npx vite build -c vite.board-preview.config.ts
 */
export default defineConfig({
  root: 'tools',
  publicDir: false,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: '../board-out',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 400_000,
    rollupOptions: { input: 'tools/board-preview.html' },
  },
});
