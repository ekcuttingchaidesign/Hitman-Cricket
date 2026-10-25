// Builds the Super10 team kits viewer (kits.html, src/kits-preview.ts) into
// one self-contained HTML file for publishing as an artifact, the shirt
// numbers' lettering carried in it:
//   node scripts/kits-artifact.mjs [out.html]
// `npx vite` serves the same page at /kits.html while working on it.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/kits.html';
const dir = mkdtempSync(join(tmpdir(), 'kits-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020',
    lib: { entry: 'src/kits-preview.ts', formats: ['iife'], name: 'KitsPreview', fileName: () => 'kits.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'kits.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const saira = `data:font/woff2;base64,${readFileSync('src/assets/saira-latin-900-italic.woff2').toString('base64')}`;
const page = readFileSync('kits.html', 'utf8')
  .replace('/src/assets/saira-latin-900-italic.woff2', saira)
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${js}</script>`);
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
