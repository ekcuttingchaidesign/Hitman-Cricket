/**
 * The update's stories, driven in a real browser.
 *
 *   npx vite --port 5199 &
 *   node scripts/whatsnew-check.mjs                    # that dev server
 *   node scripts/whatsnew-check.mjs http://…:4173      # a preview build
 *
 * Every rule this screen has is about *when* it appears — twice unasked, then
 * never; on demand from the board for ever, without spending either of the two
 * — and none of that is a thing a unit test can watch happen. It is also the
 * one screen in the game that stands between a player and the innings they came
 * for, so the way out of it is worth proving rather than assuming.
 *
 * It writes nothing but this browser's own localStorage, in a throwaway
 * profile, so it is safe to point anywhere.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const title = () => page.$eval('.whatsnew-title', node => node.textContent.trim());
const seen = () => page.evaluate(() => localStorage.getItem('hitman-whatsnew'));
async function arrive() {
  await page.waitForTimeout(3000);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(1500); }
}

await page.goto(`${base}/`, { waitUntil: 'load' });
await arrive();

// ── The first visit ────────────────────────────────────────────────────────
await page.click('#start');
const opened = await page.waitForSelector('.whatsnew-sheet', { timeout: 10_000 })
  .then(() => true).catch(() => false);
check(opened, 'the play key stops at the stories the first time');
if (!opened) { await browser.close(); process.exit(1); }

const first = await title();
check(await page.$eval('#whatsnew-done', key => key.textContent.trim()) === 'SKIP TO MODE SELECTION',
  'the way out says where it goes');
await page.click('#whatsnew-next');
const second = await title();
await page.click('#whatsnew-next');
const third = await title();
check(new Set([first, second, third]).size === 3, 'a tap on the right moves it on', [first, second, third].join(' | '));
await page.click('#whatsnew-back');
check(await title() === second, 'and a tap on the left goes back');

await page.click('#whatsnew-done');
await page.waitForTimeout(700);
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  'the key puts the stories away');
check(await page.$eval('#modes', node => !node.classList.contains('hidden')),
  'and lands on the mode picker it promised');
check(await seen() === 'careers:1', 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await page.waitForTimeout(800);
check(!!(await page.$('.whatsnew-sheet')), 'it comes back a second time, because once is missed');
await page.click('#whatsnew-done');

await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await page.waitForTimeout(800);
check(!(await page.$('.whatsnew-sheet')), 'and never again on its own');
check(await seen() === 'careers:2', 'having been counted twice and no more', await seen());

// ── The way in for somebody who went looking ───────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#cover-board');
await page.waitForTimeout(1200);
const key = await page.$('#board-new');
check(!!key, 'the board carries a What\'s new key beside its close key');
if (key) {
  await key.click();
  const back = await page.waitForSelector('.whatsnew-sheet', { timeout: 10_000 })
    .then(() => true).catch(() => false);
  check(back, 'which opens the same stories however many times they have been read');
  check(await page.$eval('#whatsnew-done', one => one.textContent.trim()) === 'CLOSE',
    'and offers to close rather than to go somewhere');
  await page.click('#whatsnew-done');
  await page.waitForTimeout(500);
  check(await page.$eval('#board-overlay', node => !node.classList.contains('hidden')),
    'putting the player back on the board they came from');
  check(await seen() === 'careers:2', 'without spending one of the two', await seen());
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
