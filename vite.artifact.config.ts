import { defineConfig } from 'vite';
export default defineConfig({
  logLevel: 'warn',
  build: {
    outDir: 'artifact-out',
    emptyOutDir: true,
    target: 'es2020',
    lib: { entry: 'src/shot-preview.ts', formats: ['iife'], name: 'RigPreview', fileName: () => 'rig.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
