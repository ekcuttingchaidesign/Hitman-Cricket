import { defineConfig } from 'vite';
/**
 * The innings-end card lab, built to a folder that can be hosted anywhere.
 *
 * `npm run dev` serves the lab already, which is enough while working on the
 * card. This is for the other case: showing somebody the states without asking
 * them to clone the repository and run a server — a review of how a card reads
 * should cost a reviewer one tap, not one checkout.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-lab',
    // The avatars are the only fetch the card makes, and inlining them means the
    // built page is the whole lab rather than a page plus a folder.
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'tools/card-lab.html',
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});
