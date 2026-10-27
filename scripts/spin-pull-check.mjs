/**
 * The pull off the spinner, in a real browser: every ball the spinner's and
 * all but the arm ball dropped short (`?spinpull=1`), played on a clock wound
 * by hand as hook-check winds it, in the Blast and in Survival. At the ball
 * dropped short the A key plays the pull: on time it goes for six in the Blast
 * and four off Survival's ladder, and a thumb swiped to leg plays it too. At
 * the arm ball the same key plays the pull on time and the flick a touch late
 * (OK), which is the rule that picks between them by timing, proved in play
 * and not only in the unit tests.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/spin-pull-check.mjs
 *
 * When it is played and what it is worth are `spinPull` and `spinPulled`'s,
 * in `tests/spin-pull.test.ts`; the stroke itself is the rig's, in
 * `tests/batter.test.ts`. Needs `VITE_SHOW_SURVIVE=1` on the server.
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
  const rig = () => page.evaluate(() => window.__cricket.batter());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=271&spinpull=1`, { waitUntil: 'load' });
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
  return { page, errors, advance, snap, rig };
}

/** A key pressed and let go, stamped with the page's own time, which a wound clock does reach. */
function press(page, key) {
  return page.evaluate(key => {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, key);
}

/** A thumb across the picture to leg, as touch events the browser turns into pointer events. */
async function swipe(page) {
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize();
  const at = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const x = width / 2, y = height * .55;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x, y) });
  for (const step of [1, 2, 3, 4]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x - step * 18, y) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** To the next ball on its way, or null when the innings is over first. */
async function nextBall({ advance, snap }) {
  let seen = await snap();
  for (let i = 0; i < 160 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}

/** Until the ball is played out: what the rig played and what came of it. */
async function playedOut({ advance, snap, rig }) {
  let pulling = false, struck = null;
  for (let i = 0; i < 60; i++) {
    await advance(50);
    const now = await snap();
    if ((await rig()).spinPulling) pulling = true;
    if (!struck && now.phase === 'SHOT_RESOLVE') struck = now;
    if (now.phase === 'RESULT' || now.phase === 'READY') return { ...(struck ?? now), outcome: now.outcome, runs: now.runs, pulling };
  }
  return { ...(struck ?? await snap()), pulling };
}

// Late enough to be OK in each mode's windows and no worse: the Blast's OK is
// 78 to 135ms off, a tailender's 40 to 78.
for (const [mode, ok, six] of [['classic', 100, 6], ['survive', 55, 4]]) {
  console.log(`pull off the spinner, ${mode}`);
  const session = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page, errors, advance, snap } = session;
  await page.locator(`#mode-${mode}`).click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const plays = [];
  const want = ['short on time', 'short swiped', 'arm on time', 'arm late'];
  for (let ball = 0; ball < 40 && plays.length < want.length; ball++) {
    const seen = await nextBall(session);
    if (!seen) break;
    const arm = seen.style === 'ARM_BALL';
    const which = want.find(w => !plays.some(p => p.which === w) && (arm ? w.startsWith('arm') : seen.dragged && w.startsWith('short')));
    if (!which) {
      // Blocked, in time, to get on to the next ball.
      await advance(seen.contactAt - seen.elapsed); await press(page, 's'); await advance(1800); continue;
    }
    const before = seen.runs;
    await advance(seen.contactAt - seen.elapsed + (which === 'arm late' ? ok : 0));
    if (which === 'short swiped') await swipe(page); else await press(page, 'a');
    if (which === 'short on time') {
      await advance(120); await page.screenshot({ path: `test-results/spin-pull-${mode}-contact.png` });
      await advance(260); await page.screenshot({ path: `test-results/spin-pull-${mode}-finish.png` });
    }
    const played = await playedOut(session);
    plays.push({ ...played, which, scored: played.runs - before, dragged: seen.dragged, style: seen.style });
    console.log(`        ${which} (${seen.style}${seen.dragged ? ', short' : ''}): ${played.shot} ${played.timingDelta}ms ${played.timingGrade} pull=${played.pulling} → ${played.outcome}`);
    await advance(1800);
  }
  const of = which => plays.find(p => p.which === which);
  const onTime = of('short on time'), swiped = of('short swiped'), arm = of('arm on time'), late = of('arm late');
  check(plays.length === want.length, 'the short ball and the arm ball both come, every over', plays.map(p => p.which).join(', '));
  if (onTime) {
    check(onTime.pulling && onTime.spinPulled, 'A at the ball dropped short plays the pull, in the rig and in the score', JSON.stringify(onTime));
    check(onTime.scored === six, `on time it is worth ${six}`, onTime.scored);
  }
  if (swiped) check(swiped.pulling && swiped.shot === 'LEG', 'a thumb swiped to leg at it plays the pull too', JSON.stringify({ shot: swiped.shot, pulling: swiped.pulling }));
  if (arm) check(arm.pulling && arm.spinPulled, 'the arm ball on time is pulled', JSON.stringify(arm));
  if (late) {
    check(late.timingGrade === 'OK', 'a touch late is OK', late.timingGrade);
    check(!late.pulling && !late.spinPulled, 'and the arm ball timed OK is still the flick', JSON.stringify({ pulling: late.pulling, spinPulled: late.spinPulled }));
  }
  // What GoatCounter is sent at the innings' end (`strokeMarks`), tallied off the real balls.
  const tally = (await snap()).spinPulls;
  check(tally.faced >= 2 && tally.played >= 3 && tally.arm >= 1, 'the tally counts the short balls faced and the pulls played, the arm ball among them', JSON.stringify(tally));
  check(tally.sixes + tally.fours >= 1, 'and what the pull came to', JSON.stringify(tally));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
