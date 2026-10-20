/**
 * The hook, in a real browser: a bouncer on off stump or wider, hooked off
 * the down-and-to-leg diagonal, meter or none. Every ball a bouncer
 * (`?bouncers=1`), played on a clock wound by hand as pull-check winds it;
 * the ones on the stumps or down the leg side are ducked, and the first three
 * he can hook are hooked — one on time, which goes over fine leg for six with
 * the pull's flash; one off a real swipe of the thumb, to show the swipe is
 * read as the hook at that ball and not as the block or the scoop; and last
 * one late, which takes the glove through to the keeper, and in Survival is
 * the end of the innings.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/hook-check.mjs
 *
 * Which balls it answers and what each grade is worth are `hookable` and
 * `hooked`'s, in `tests/game.test.ts` and `tests/survive.test.ts`; the stroke
 * itself is the rig's, in `tests/batter.test.ts`. Needs `VITE_SHOW_SURVIVE=1`
 * on the server, for the Test match.
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
      // Past the update's stories.
      localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
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
  await page.goto(`${base}/?debug=1&seed=314&bouncers=1`, { waitUntil: 'load' });
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

/**
 * Keys pressed together and let go, stamped with the page's own time: a key
 * sent the ordinary way carries the browser's real clock, which a wound clock
 * does not reach.
 */
function press(page, ...keys) {
  return page.evaluate(keys => {
    for (const type of ['keydown', 'keyup']) for (const key of keys) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, keys);
}

/** A thumb down and to leg across the picture, as touch events the browser turns into pointer events. */
async function swipe(page) {
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize();
  const at = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const x = width / 2, y = height * .55;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x, y) });
  for (const step of [1, 2, 3, 4]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x - step * 15, y + step * 15) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const hookable = seen => seen.style === 'SHORT' && (seen.effectiveLine === 'OFF' || seen.effectiveLine === 'OUTSIDE_OFF');

/** To the next ball on its way, or null when the innings is over first. */
async function nextBall({ advance, snap }) {
  let seen = await snap();
  for (let i = 0; i < 160 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}

/** Until the ball is played out, and what became of it. */
async function playedOut({ advance, snap }, shoot) {
  let swished = false, struck = null;
  for (let i = 0; i < 60; i++) {
    await advance(50);
    const now = await snap();
    if (now.swishing) swished = true;
    if (!struck && now.phase === 'SHOT_RESOLVE') struck = now;
    if (now.phase === 'RESULT' || now.phase === 'READY') return { ...(struck ?? now), outcome: now.outcome, swished, shoot };
  }
  return { ...(struck ?? await snap()), swished, shoot };
}

for (const [mode, late] of [['classic', 170], ['survive', 120]]) {
  console.log(`hooks, ${mode}`);
  const session = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page, errors, advance, snap } = session;
  await page.locator(`#mode-${mode}`).click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const plays = [];
  let ducked = 0;
  for (let ball = 0; ball < 30 && plays.length < 3; ball++) {
    const seen = await nextBall(session);
    if (!seen) break;
    if (!hookable(seen)) {
      // Ducked, in time: on the stumps or down the leg side the diagonal is the block.
      await advance(seen.contactAt - seen.elapsed - 30);
      await press(page, 's');
      ducked++;
      await advance(1800);
      continue;
    }
    // The late one last: gloved, it is caught, and one wicket ends a Survival innings.
    const which = ['on time', 'swiped', 'late'][plays.length];
    await advance(seen.contactAt - seen.elapsed + (which === 'late' ? late : 0));
    if (which === 'swiped') await swipe(page); else await press(page, 'a', 's');
    if (which === 'on time') {
      // He is on his way through it: photographed at the ball and at the finish.
      await advance(120); await page.screenshot({ path: `test-results/hook-${mode}-contact.png` });
      await advance(320); await page.screenshot({ path: `test-results/hook-${mode}-finish.png` });
    }
    const played = await playedOut(session, which);
    plays.push({ ...played, line: seen.effectiveLine, which });
    console.log(`        ${which} at ${seen.effectiveLine}: ${played.shot} ${played.timingDelta}ms ${played.timingGrade} → ${played.outcome}`);
    await advance(1800);
  }
  const [onTime, gloved, swiped] = ['on time', 'late', 'swiped'].map(which => plays.find(play => play.which === which));
  check(plays.length === 3, 'three bouncers he can hook come', plays.length);
  check(ducked > 0, 'and the rest are ducked', ducked);
  if (onTime) {
    check(onTime.shot === 'HOOK', 'the keys at that ball play the hook, with nothing in the meter', JSON.stringify(onTime));
    check(onTime.outcome === 'HOOKED FOR SIX!', 'on time it goes for six', onTime.outcome);
    check(onTime.swished, 'with the pull’s flash behind the bat', JSON.stringify(onTime));
  }
  if (gloved) {
    check(gloved.shot === 'HOOK', 'late, it is still the hook', gloved.shot);
    check(/CAUGHT BEHIND|OFF THE GLOVES/.test(gloved.outcome), 'and it is on the glove', gloved.outcome);
  }
  if (swiped) check(swiped.shot === 'HOOK', 'a thumb down and to leg at that ball plays it too', JSON.stringify({ shot: swiped.shot, outcome: swiped.outcome }));
  // What GoatCounter is sent at the innings' end (`strokeMarks`), tallied off the real balls:
  // the ducked ones were not the hook's ball, so they are no other stroke at it.
  const tally = (await snap()).hooks;
  check(tally.faced === plays.length && tally.played === plays.length && tally.other === 0 && tally.sixes >= 1,
    'the tally counts the bouncers to hook faced, the hooks played and the six', JSON.stringify(tally));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
