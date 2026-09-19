// Renders a contact sheet per stroke from a running dev server, so a rig change
// can be looked at rather than argued about. Not part of the build or the game.
//
//   npx vite --port 5199 &
//   node scripts/rig-sheet.mjs out-dir SQUARE_DRIVE:side PULL:leg STRAIGHT:front
//
// Strokes: STRAIGHT, COVER, SQUARE_DRIVE, PULL, CUT, CHARGE, COVER_CHARGE, ON_CHARGE, SCOOP, REVERSE_SCOOP. Views: side (square
// of the wicket on the off side, the reference recordings' angle), front (from
// the bowler), leg.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2];
const jobs = process.argv.slice(3).map(a => a.split(':'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await mkdir(out, { recursive: true });
for (const [shot, view] of jobs) {
  await page.goto(`http://127.0.0.1:5199/rig-sheet.html?shot=${shot}&view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.locator('#sheet').screenshot({ path: `${out}/${shot}-${view}.png` });
}
console.log(JSON.stringify({ errs }));
await browser.close();
