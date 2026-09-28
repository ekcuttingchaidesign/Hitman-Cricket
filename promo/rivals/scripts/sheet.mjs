// Pull frames out of the render and tile them eight to a sheet, for looking at.
// node scripts/sheet.mjs out/rivals-promo.mp4 out/check/a.png 10 25 40 ...
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), '../../package.json'));
const { chromium } = require('playwright');
const [vid, out, ...frames] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'sheet-'));
const cells = frames.map((f, i) => {
  const file = join(tmp, `f${i}.png`);
  execFileSync('npx', ['remotion', 'ffmpeg', '-v', 'error', '-ss', (Number(f) / 30).toFixed(4), '-i', vid,
    '-frames:v', '1', '-vf', 'scale=405:720', '-y', file]);
  return `<div><img src="data:image/png;base64,${readFileSync(file).toString('base64')}"><b>${f}</b></div>`;
});
const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(4,405px);gap:6px;padding:6px;width:max-content">
<style>div{position:relative;width:405px;height:720px}b{position:absolute;left:8px;top:8px;background:#000;color:#ff0;font:bold 30px sans-serif;padding:2px 8px}</style>${cells.join('')}</body>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1650, height: 1470 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
rmSync(tmp, { recursive: true });
console.log('wrote', out);
