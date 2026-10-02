/**
 * Play again, in a real browser on a phone: an innings played to its end, the
 * end card's PLAY AGAIN, and the next innings under way — the field back on
 * its marks and the first ball bowled on time.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/again-check.mjs
 *   node scripts/again-check.mjs http://…:4173    # a preview build
 *
 * A new innings starts the game's clock again from nought, and the field's
 * plans were all timed on the old one: every fielder was held at the first
 * step of something due half a minute later, and the bowler, who waits for
 * the field to be back on its marks before he runs in, stood waiting for a
 * field that never came. The screen looked frozen. Only playing an innings
 * through to its end and starting another reaches it.
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

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'rivals-launch:9');
    localStorage.setItem('hitman-unveiled', 'ground-pavilion');
  } catch { /* Then the notices stand. */ }
});
await page.route('**/api/**', route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
}));
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const snap = () => page.evaluate(() => window.__cricket.snapshot());
const field = () => page.evaluate(() => window.__cricket.field());
await page.clock.install();
await page.goto(`${base}/?debug=1&seed=314`, { waitUntil: 'load' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
await advance(2500);
await page.waitForTimeout(800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
await page.locator('#start').click({ force: true, timeout: 15_000 });
await advance(600);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await advance(400);
}
await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
await advance(600);
await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });

/** A key pressed and let go, stamped with the page's own time (see `pull-check.mjs`). */
function press(key) {
  return page.evaluate(key => {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, key);
}

// Out three times as quickly as possible: late swings that go up and are
// caught, the field busy running and diving right up to the last ball.
let seen = await snap();
for (let ball = 0; ball < 30 && seen.phase !== 'INNINGS_END'; ball++) {
  for (let i = 0; i < 200 && seen.phase !== 'BALL_IN_FLIGHT' && seen.phase !== 'INNINGS_END'; i++) { await advance(100); seen = await snap(); }
  if (seen.phase !== 'BALL_IN_FLIGHT') break;
  await advance(seen.contactAt - seen.elapsed + 145);
  await press(['OFF', 'OUTSIDE_OFF'].includes(seen.effectiveLine) ? 'w' : 'a');
  for (let i = 0; i < 80 && seen.phase !== 'READY' && seen.phase !== 'INNINGS_END'; i++) { await advance(100); seen = await snap(); }
}
check(seen.phase === 'INNINGS_END', 'an innings played to its end', `${seen.phase}, ${seen.wickets} down`);

// The end card, and PLAY AGAIN on it.
const again = page.locator('#again');
for (let i = 0; i < 60 && !(await again.isVisible().catch(() => false)); i++) await advance(250);
check(await again.isVisible(), 'the end card offers PLAY AGAIN');
await again.click({ force: true });
await advance(300);
seen = await snap();
for (let i = 0; i < 40 && seen.phase !== 'READY'; i++) { await advance(100); seen = await snap(); }
check(seen.phase === 'READY', 'a new innings starts', seen.phase);

// The first ball of it: bowled on time, to a field on its marks.
const ready = seen.elapsed;
for (let i = 0; i < 400 && seen.phase === 'READY'; i++) { await advance(25); seen = await snap(); }
const waited = seen.elapsed - ready;
check(seen.phase === 'BOWLER_RUNUP' && waited < 1200, 'the bowler runs in without waiting on the field', `${seen.phase} after ${waited}ms`);
const home = await field();
const off = home.fielders.filter(f => f.home > .45);
check(off.length === 0, 'every fielder on his mark', JSON.stringify(off));
for (let i = 0; i < 60 && seen.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(50); seen = await snap(); }
check(seen.phase === 'BALL_IN_FLIGHT', 'and the ball is bowled', seen.phase);
const walking = (await field()).fielders.filter(f => f.action === 'Walking in' || f.action === 'Split step');
check(walking.length >= 2, 'with the field walking in', JSON.stringify((await field()).fielders.map(f => f.action)));
await page.screenshot({ path: 'test-results/again.png' });
check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
