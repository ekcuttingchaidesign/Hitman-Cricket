// Renders the fielders' takes — collected, a dive saving it, a running catch —
// from a running dev server, so a pose can be looked at rather than argued
// about. Not part of the build.
//
//   npx vite --port 5201 &
//   node scripts/fielder-sheet.mjs out-dir side bat
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2];
const views = process.argv.slice(3);
const base = process.env.BASE ?? 'http://127.0.0.1:5201';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 2000, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await mkdir(out, { recursive: true });
for (const view of views.length ? views : ['side', 'bat']) {
  await page.goto(`${base}/fielder-sheet.html?view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await page.locator('#sheet').screenshot({ path: `${out}/fielders-${view}.png` });
}
console.log(JSON.stringify({ errs }));
await browser.close();
