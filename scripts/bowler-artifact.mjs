// Builds the bowling actions viewer (bowler.html, src/bowler-preview.ts) into
// one self-contained HTML file for publishing as an artifact:
//   node scripts/bowler-artifact.mjs [out.html]
// `npx vite` serves the same page at /bowler.html while working on it.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/bowler.html';
const dir = mkdtempSync(join(tmpdir(), 'bowler-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020',
    lib: { entry: 'src/bowler-preview.ts', formats: ['iife'], name: 'BowlerPreview', fileName: () => 'bowler.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'bowler.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const page = readFileSync('bowler.html', 'utf8')
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${js}</script>`);
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
