/**
 * The flick's version two, in a real browser: worked off the pads with the
 * wrists, four or less. Always that version (`?flickv=2`, practice), played
 * on a clock wound by hand as hook-check winds it; every ball that is not a
 * pace bowler's on the pads is blocked, and the first two that are are
 * flicked — one on time, which goes for four along the ground, and one late,
 * which is a one, a two, a three (never in a Test) or chipped up and caught.
 * In the Blast and in Survival.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/flick-check.mjs
 *
 * What each grade is worth is `flicked`'s, in `tests/flick.test.ts`; the
 * stroke itself is the rig's, in `tests/batter.test.ts`.
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

/** A page past the notices, on a clock wound by hand, at the mode picker. */
async function open(options) {
  const page = await browser.newPage(options);
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'super10:9');
    } catch { /* Then the notices stand. */ }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=271&flickv=2`, { waitUntil: 'load' });
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
    await done.click({ force: true, timeout: 3000 }).catch(() => {});
    await advance(400);
  }
  return { page, errors, advance, snap };
}

/** A key pressed and let go, stamped with the page's own time. */
function press(page, key) {
  return page.evaluate(key => {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, key);
}

/** A pace bowler's ball on the pads, below pull height: the flick's. */
const flickable = seen => !['SHORT', 'OFF_SPIN', 'LEG_SPIN', 'ARM_BALL'].includes(seen.style)
  && (seen.effectiveLine === 'LEG' || seen.effectiveLine === 'OUTSIDE_LEG');

async function nextBall({ advance, snap }) {
  let seen = await snap();
  for (let i = 0; i < 160 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}

async function playedOut({ advance, snap }) {
  let struck = null;
  for (let i = 0; i < 60; i++) {
    await advance(50);
    const now = await snap();
    if (!struck && now.phase === 'SHOT_RESOLVE') struck = now;
    if (now.phase === 'RESULT' || now.phase === 'READY') return { ...(struck ?? now), outcome: now.outcome };
  }
  return { ...(struck ?? await snap()) };
}

for (const [mode, late, ones] of [['classic', 100, /^(1 RUN|2 RUNS|3 RUNS|CHIPPED — CAUGHT!)$/], ['survive', 70, /^(1 RUN|2 RUNS|CHIPPED — CAUGHT!)$/]]) {
  console.log(`flicks, ${mode}`);
  const session = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page, errors, advance } = session;
  await page.locator(`#mode-${mode}`).click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const plays = [];
  for (let ball = 0; ball < 30 && plays.length < 2; ball++) {
    const seen = await nextBall(session);
    if (!seen) break;
    if (!flickable(seen)) {
      await advance(seen.contactAt - seen.elapsed - 30);
      await press(page, 's');
      await advance(1800);
      continue;
    }
    const which = ['on time', 'late'][plays.length];
    await advance(seen.contactAt - seen.elapsed + (which === 'late' ? late : 0));
    await press(page, 'a');
    if (which === 'on time') {
      await advance(110); await page.screenshot({ path: `test-results/flick-${mode}-contact.png` });
      await advance(330); await page.screenshot({ path: `test-results/flick-${mode}-wrap.png` });
    }
    const played = await playedOut(session);
    plays.push({ ...played, line: seen.effectiveLine, which });
    console.log(`        ${which} at ${seen.effectiveLine}: ${played.shot} ${played.timingDelta}ms ${played.timingGrade} → ${played.outcome}`);
    await advance(1800);
  }
  const [onTime, lateOne] = ['on time', 'late'].map(which => plays.find(play => play.which === which));
  check(plays.length === 2, 'two balls on the pads come', plays.length);
  if (onTime) {
    check(onTime.shot === 'LEG', 'the key plays the flick', onTime.shot);
    check(onTime.outcome === 'FLICKED — FOUR!', 'on time it is four', onTime.outcome);
  }
  if (lateOne) check(ones.test(lateOne.outcome ?? ''), 'late, it is a few or a catch, never a boundary', `${lateOne.timingGrade} ${lateOne.outcome}`);
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
