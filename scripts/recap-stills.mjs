// Writes stills of the game's batter for the year recap's comic pages, as
// transparent PNGs, through `recap-stills.html` on a running dev server.
//
//   npx vite --port 5201 &
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/recap-stills.mjs http://localhost:5201 out/stills [asks.json]
//
// asks.json is a list of `StillAsk`s (src/recap-stills.ts) with a `name` each;
// without one, the set below is written: one still per personality's pose.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5201', out = 'out/stills', file] = process.argv.slice(2);
const SET = [
  { name: 'six-machine', shot: 'LOFTED', age: 560, az: 30, el: -6 },
  { name: 'the-wall', shot: 'DEFEND', age: 420, az: 20, el: 2 },
  { name: 'pull', shot: 'PULL', age: 520, az: 10, el: -4 },
  { name: 'slog-sweep', shot: 'SLOG_SWEEP', age: 560, az: 25, el: 0 },
  { name: 'helicopter', shot: 'HELICOPTER', age: 420, az: 5, el: -4 },
  { name: 'admire', shot: 'after:admire', age: 900, az: 30, el: 0 },
];
const asks = file ? JSON.parse(readFileSync(file, 'utf8')) : SET;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
page.on('pageerror', e => console.error('page:', e.message));
await page.goto(`${base}/recap-stills.html`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120_000 });
for (const ask of asks) {
  const url = await page.evaluate(a => window.__stills.render(a), ask);
  writeFileSync(join(out, `${ask.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', ask.name);
}
await browser.close();
