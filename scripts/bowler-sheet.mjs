// Renders the bowling actions' contact sheets from a running dev server, so an
// action can be looked at rather than argued about. Not part of the build.
//
//   npx vite --port 5201 &
//   node scripts/bowler-sheet.mjs out-dir batter side
//
// Views: batter (from the batter's end, as the game sees him, closer) and side.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2];
const views = process.argv.slice(3);
const base = process.env.BASE ?? 'http://127.0.0.1:5201';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 2700, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await mkdir(out, { recursive: true });
for (const view of views.length ? views : ['batter', 'side']) {
  await page.goto(`${base}/bowler-sheet.html?view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await page.locator('#sheet').screenshot({ path: `${out}/bowlers-${view}.png` });
}
console.log(JSON.stringify({ errs }));
await browser.close();
