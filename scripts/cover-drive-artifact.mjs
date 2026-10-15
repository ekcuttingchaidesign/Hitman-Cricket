// Builds the cover-drive viewer (cover-drive.html, src/cover-drive-preview.ts)
// into one self-contained HTML file for publishing as an artifact:
//   node scripts/cover-drive-artifact.mjs [out.html]
// `npx vite` serves the same page at /cover-drive.html while working on it.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/cover-drive.html';
const dir = mkdtempSync(join(tmpdir(), 'cover-drive-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020',
    lib: { entry: 'src/cover-drive-preview.ts', formats: ['iife'], name: 'CoverDrive', fileName: () => 'cover-drive.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'cover-drive.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const page = readFileSync('cover-drive.html', 'utf8')
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${js}</script>`);
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
