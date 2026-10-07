/**
 * `?actions=1`: the keys along the foot of the picture, one a thing the batter
 * does once a ball is done with — ADMIRE, WATCH, TWIRL, BRUSH, SHADOW, SCRUB.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/actions-check.mjs http://127.0.0.1:5201
 *
 * Between balls, each key plays the stroke it follows and then the thing
 * itself: the batter leaves his guard and comes back to it, the bowler waits
 * at his mark until he has, and nothing is bowled or scored meanwhile. A key
 * tapped with a ball in the air waits for that ball to be dead. Which ball in
 * an innings brings which of them is `afterBall`'s, in the unit tests, and how
 * each moves is held to the body there too; this is the keys and the waiting.
 *
 * Pictures land in test-results/actions/, one in the middle of each.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results/actions', { recursive: true });
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errors.push(m.text()); });
await page.route('**/api/board**', route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
}));

await page.goto(`${base}/?actions=1&debug=1&seed=222&lights=day`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
await page.locator('#start').click({ force: true });
for (let i = 0; i < 30; i++) {
  const mode = page.locator('#mode-classic'), done = page.locator('#whatsnew-done');
  if (await mode.isVisible().catch(() => false)) {
    await page.waitForTimeout(500);
    await mode.click({ force: true, timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (!(await mode.isVisible().catch(() => false))) break;
    continue;
  }
  if (await done.isVisible().catch(() => false)) await done.click({ force: true, timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}
await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });

const keys = page.locator('.action-keys .action-key');
check(await keys.count() === 6, 'six keys along the foot of the picture', await keys.count());
check(JSON.stringify(await keys.allTextContents()) === JSON.stringify(['ADMIRE', 'WATCH', 'TWIRL', 'BRUSH', 'SHADOW', 'SCRUB']), 'in order', (await keys.allTextContents()).join(' '));

const phase = () => page.evaluate(() => window.__cricket.snapshot().phase);
const balls = () => page.evaluate(() => window.__cricket.snapshot().balls);
const pose = () => page.evaluate(() => { const p = window.__cricket.batter(); return { hip: p.hip, grip: p.grip }; });
const away = (a, b) => Math.hypot(...a.grip.map((v, i) => v - b.grip[i])) + Math.abs(a.hip[1] - b.hip[1]);
const guard = await pose();

// The first key with a ball on its way: it waits for that ball to be dead,
// and plays the moment it is. Each one after is asked for while the last is
// still going, so the bowler, waiting on him, never bowls in between: the
// whole row is played through without another ball, which is what keeps an
// innings nobody is batting in alive long enough to look at all six.
let seen = await phase();
for (let i = 0; i < 120 && seen !== 'BALL_IN_FLIGHT' && seen !== 'BOWLER_RUNUP'; i++) { await page.waitForTimeout(100); seen = await phase(); }
check(seen === 'BALL_IN_FLIGHT' || seen === 'BOWLER_RUNUP', 'a ball on its way', seen);
await page.locator('.action-key[data-kind="admire"]').click();
let moved = false;
for (let i = 0; i < 120 && !moved; i++) { await page.waitForTimeout(100); moved = away(await pose(), guard) > .1 && await phase() === 'READY'; }
check(moved, 'that ball is played out first, and then he starts');
const bowled = await balls();

for (const [n, kind] of ['admire', 'watch', 'twirl', 'brush', 'shadow', 'scrub'].entries()) {
  console.log(kind);
  if (n > 0) await page.locator(`.action-key[data-kind="${kind}"]`).click();
  let furthest = 0, held = true, pictured = false;
  const started = Date.now();
  // Most of each, then on to the next before it is quite over.
  while (Date.now() - started < 2300) {
    await page.waitForTimeout(120);
    furthest = Math.max(furthest, away(await pose(), guard));
    if (await phase() !== 'READY') held = false;
    if (!pictured && Date.now() - started > 1300) { pictured = true; await page.screenshot({ path: `test-results/actions/${kind}.png` }); }
  }
  check(furthest > .15, 'he leaves his guard', furthest.toFixed(3));
  check(held, 'and the bowler waits at his mark while he does');
}
check(await balls() === bowled, 'nothing bowled while all six were played', `${bowled} then ${await balls()}`);

console.log('and after the last');
let back = false;
for (let i = 0; i < 60 && !back; i++) { await page.waitForTimeout(100); back = away(await pose(), guard) < .02; }
check(back, 'he is back in his guard');
let on = await phase();
for (let i = 0; i < 80 && on === 'READY'; i++) { await page.waitForTimeout(100); on = await phase(); }
check(on === 'BOWLER_RUNUP' || on === 'BALL_IN_FLIGHT', 'and the bowler comes in', on);

check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
