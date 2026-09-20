/**
 * The career card's own screen, checked in a real browser.
 *
 *   npx vite --port 5199 &
 *   node scripts/stats-check.mjs                    # that dev server
 *   node scripts/stats-check.mjs http://…:4173      # a preview build
 *
 * Everything on this screen is either painted into a canvas or wired up by
 * hand, and neither of those is something a unit test can see. Both bugs this
 * script was written after were invisible to 930 passing tests and obvious in
 * a browser within a second: a sheet that threw on the way to focusing a key
 * that is no longer drawn, leaving the card stuck on "Drawing your card…", and
 * a one-mode build that took every way back off the row once you were standing
 * on My Stats.
 *
 * It reads only — no innings is played and nothing is posted, so it is safe to
 * point at anything.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
/** Where this machine keeps its browser, for images that ship one ready-made. */
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.goto(`${base}/`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
// The cover offers the board without an innings being played, which is the
// shortest way to the card and the one a new player takes.
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(2000); }
await page.click('#cover-board');
await page.waitForTimeout(1000);

const mine = await page.$('#board-tab-mine');
check(!!mine, 'the board carries a My Stats tab');
if (mine) await mine.click();

// The picture, which is the thing the two bugs above both stopped arriving.
const drew = await page.waitForSelector('.stats-shot', { timeout: 20_000 }).then(() => true).catch(() => false);
check(drew, 'the card is painted rather than left drawing', await page.$eval('.stats-stage', n => n.textContent.trim()).catch(() => ''));

const tabs = await page.$$eval('.board-tabs button', keys => keys.map(key => key.textContent.trim()));
check(tabs.length >= 2, 'the card keeps a way back to the board on the tab row', tabs.join(' | '));

const taps = await page.$$('.stats-tap');
const figures = await page.$$eval('.stats-tap', keys => keys.map(key => key.dataset.stat));
check(taps.length > 0, 'every figure on the picture carries a key to press', figures.join(', '));

if (taps.length) {
  await taps[0].click();
  await page.waitForTimeout(500);
  const said = await page.$eval('#stats-toast', toast => ({
    up: toast.classList.contains('is-up'), text: toast.textContent.trim(),
  }));
  check(said.up && said.text.length > 20, 'pressing a figure says what it counts', JSON.stringify(said));
  await page.waitForTimeout(5200);
  const gone = await page.$eval('#stats-toast', toast => !toast.classList.contains('is-up'));
  check(gone, 'and the toast takes itself away again');
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
