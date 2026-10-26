// Builds the batter model page (batter-model.html, src/batter-model-preview.ts)
// into one self-contained HTML file for publishing as an artifact:
//   node scripts/batter-model-artifact.mjs [out.html]
// `npx vite` serves the same page at /batter-model.html while working on it.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/batter-model.html';
const dir = mkdtempSync(join(tmpdir(), 'batter-model-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020',
    lib: { entry: 'src/batter-model-preview.ts', formats: ['iife'], name: 'BatterModel', fileName: () => 'batter-model.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'batter-model.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const page = readFileSync('batter-model.html', 'utf8')
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${js}</script>`);
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
