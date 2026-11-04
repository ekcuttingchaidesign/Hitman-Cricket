// Builds the replay camera lab (replay-camera.html, src/replay-camera.ts) into
// one self-contained HTML file for publishing as an artifact, every asset inlined:
//   node scripts/replay-camera-artifact.mjs [out.html]
// `npx vite` serves the same page at /replay-camera.html while working on it.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/replay-camera.html';
const dir = mkdtempSync(join(tmpdir(), 'replay-camera-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020', assetsInlineLimit: 100_000_000,
    lib: { entry: 'src/replay-camera.ts', formats: ['iife'], name: 'ReplayCamera', fileName: () => 'replay-camera.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'replay-camera.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const page = readFileSync('replay-camera.html', 'utf8')
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${js}</script>`);
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
