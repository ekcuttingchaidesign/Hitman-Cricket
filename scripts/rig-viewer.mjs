// Bundles the rig viewer (`tools/rig-viewer.html`) into one page with nothing
// to fetch: the game's bowler, three.js and the two fonts all inline, so it can
// be published or sent as a single file. Not part of the build or the game.
//
//   node scripts/rig-viewer.mjs out/bowler-rig.html
//
// The page is written without its own <html>, <head> or <body>, because the
// place it is published wraps it in one; a browser opens it as it is.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/rig-viewer.mjs <out.html>'); process.exit(1); }

const html = await readFile('tools/rig-viewer.html', 'utf8');
const { outputFiles } = await build({
  entryPoints: ['tools/rig-viewer.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none',
});
const script = outputFiles[0].text.replaceAll('</script', '<\\/script');

const font = async (family, file, weight) => {
  const data = (await readFile(`src/assets/${file}`)).toString('base64');
  return `@font-face{font-family:${family};src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-display:swap}`;
};
const fonts = (await font('Jaro', 'jaro-latin.woff2', 400)) + (await font('Satoshi', 'satoshi-latin.woff2', '300 900'));

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script>${script}</script>`);

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${title}\n<style>${fonts}\n${style}</style>\n${body.trim()}\n`);
console.log(`${out}: ${(Buffer.byteLength(script) / 1024).toFixed(0)} KB of script`);
