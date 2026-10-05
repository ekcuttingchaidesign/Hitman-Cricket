/**
 * The fielders, in a real browser, in real innings: nobody stands frozen,
 * the field walks in with the bowler, and a ball skied to it is taken by a man
 * who ran there from his own mark — never by one who appears under it.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/field-check.mjs
 *   node scripts/field-check.mjs http://…:4173    # a preview build
 *
 * The rig itself — limbs within their length, planted feet that do not slide,
 * nothing under the turf — is held by `tests/fielder.test.ts`. What only a
 * browser can see is the rig being driven by the game: the run-up starting
 * the walk-in, the release timing the split step, a mishit choosing a fielder
 * and bending its flight into his hands. So this plays balls on a clock wound
 * by hand, swiping late to the leg side so they go up towards midwicket, and
 * watches every fielder frame by frame from the hit to the catch.
 *
 * Screenshots land in test-results/, for a person to look at.
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
// A phone held upright, which is how most people play and the narrowest view
// of the ground there is: a catch put where a laptop sees it can still be off
// this screen. At one pixel to the point, because every step of the wound
// clock draws frames and a headless browser draws them in software.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'marathon-launch:9');
  } catch { /* Then the notices stand. */ }
});
await page.route('**/api/board**', route => route.fulfill({
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
  // Gone between the look and the tap is gone: the stories close themselves.
  await done.click({ force: true, timeout: 3000 }).catch(() => {});
  await advance(400);
}
await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
await advance(600);
await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });

let seen = await snap();
for (let i = 0; i < 60 && seen.phase !== 'READY'; i++) { await advance(250); seen = await snap(); }
check(seen.phase === 'READY', 'an innings is under way', seen.phase);

console.log('waiting');
const before = await field();
await advance(1200);
const later = await field();
check(before.fielders.length === 6, 'six fielders', before.fielders.length);
const stirred = before.fielders.filter((f, i) => Math.hypot(f.x - later.fielders[i].x, f.y - later.fielders[i].y, f.z - later.fielders[i].z) > .002);
check(stirred.length === 6, 'every one of them moving while he waits', JSON.stringify(stirred.map(f => f.name)));

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

let walked = false, dived = null, settled = null, wickets = 0;
for (let ball = 0; ball < 24 && !(dived && walked); ball++) {
  seen = await snap();
  for (let i = 0; i < 120 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') break;
    await advance(100); seen = await snap();
  }
  if (seen.phase !== 'BALL_IN_FLIGHT') break;
  if (!walked) {
    // Each in his own time, so some are still on their way as it is let go.
    await advance(250);
    const now = await field();
    const ring = now.fielders.filter(f => !f.deep);
    walked = ring.every(f => f.action === 'Walking in' || f.action === 'Split step' || f.home > .5);
    check(walked, 'the ring walks in with the bowler', JSON.stringify(ring));
    seen = await snap();
  }
  // Late enough to sky it — a poor stroke in the classic innings always goes
  // up — and to the leg side where the line allows, where midwicket has to go
  // and get it. Poor runs
  // from 135ms late to 205, shrunk to 82% for a quick ball, so 145 is poor
  // whatever the pace; any later and a quick one is missed altogether.
  // A stroke that suits the line, or it is no stroke at all and he is out
  // leg before: the swipe to leg on leg and middle, straight on off.
  // Three wickets end the innings, so once a high catch has been seen the
  // off-side balls are blocked, and the wickets kept for the leg side.
  const off = ['OFF', 'OUTSIDE_OFF'].includes(seen.effectiveLine);
  if (off && settled) {
    await advance(seen.contactAt - seen.elapsed);
    await press('s');
    let rest = await snap();
    for (let i = 0; i < 80 && rest.phase !== 'READY' && rest.phase !== 'INNINGS_END'; i++) { await advance(100); rest = await snap(); }
    continue;
  }
  await advance(seen.contactAt - seen.elapsed + 145);
  await press(off ? 'w' : 'a');
  const frames = [];
  let at = await snap();
  let shot = false;
  for (let i = 0; i < 120 && at.phase !== 'RESULT' && at.phase !== 'READY' && at.phase !== 'INNINGS_END'; i++) {
    const now = { ...(await field()), t: at.elapsed };
    frames.push(now);
    // The moment he takes it, for a person to look at.
    if (!shot && now.catchAt && now.t >= now.catchAt) { shot = true; await page.screenshot({ path: `test-results/field-catch-${ball + 1}.png` }); }
    await advance(40);
    at = await snap();
  }
  const outcome = at.outcome;
  const first = frames.find(f => f.catcher);
  if (!first) { console.log(`        ball ${ball + 1}: ${outcome}, nobody sent`); continue; }
  wickets++;
  // Never further in a frame than a man can go: a sprint, or the flat of a dive.
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].t - frames[i - 1].t) / 1000;
    if (dt <= 0) continue;
    for (let k = 0; k < 6; k++) {
      const a = frames[i - 1].fielders[k], b = frames[i].fielders[k];
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.z - b.z) / dt);
    }
  }
  const catcher = first.fielders.find(f => f.name === first.catcher);
  // From the catch on, the ball is wherever his hands are. Sampled at the
  // frame nearest the catch instead, a ball falling the last of a skier at
  // twenty-odd metres a second is a third of a metre short of them on a
  // clock that steps forty milliseconds at a time.
  const held = frames.filter(f => f.t >= first.catchAt && f.held && f.ball);
  const near = held[0] ?? frames[frames.length - 1];
  const ball3 = near.ball, hands = near.held;
  const gap = ball3 && hands ? Math.hypot(ball3[0] - hands[0], ball3[1] - hands[1], ball3[2] - hands[2]) : Infinity;
  console.log(`        ball ${ball + 1}: ${outcome} — ${first.catcher}, ${first.style}, from ${catcher.home}m off his mark`);
  check(catcher.home < 2.6, `${first.catcher} sets off from his own patch, not from under the ball`, JSON.stringify(catcher));
  check(first.inShot === true, 'and the catch is on the screen', JSON.stringify(first.hands));
  check(worst <= 8.5, 'nobody moves faster than a sprint between frames', `${worst.toFixed(2)} m/s`);
  check(held.length > 0 && gap < .05, 'the ball comes down into his hands and stays there', `${gap.toFixed(2)}m — ball ${JSON.stringify(ball3)}, hands ${JSON.stringify(hands)}`);
  // And it got there along its flight, not by a jump: the frame before the
  // catch has it within a frame's fall of where his hands took it.
  const last = frames.filter(f => f.t < first.catchAt && f.ball).pop();
  const arrive = last ? Math.hypot(last.ball[0] - first.hands[0], last.ball[1] - first.hands[1], last.ball[2] - first.hands[2]) : Infinity;
  check(arrive < 1.4, 'arriving along its flight rather than jumping to him', `${arrive.toFixed(2)}m short a frame before`);
  if (first.style === 'dive' && !dived) {
    dived = first;
    // Back to the moment he leaves the ground and the moment he takes it.
    const travelled = Math.hypot(near.fielders.find(f => f.name === first.catcher).x - catcher.x, near.fielders.find(f => f.name === first.catcher).z - catcher.z);
    check(travelled > 2, 'and he covers the ground to get there', `${travelled.toFixed(2)}m`);
  }
  if (first.style === 'high' && !settled) settled = first;
  // On to the next ball: the field goes back to its marks while the result is
  // up, and is on them by the time the bowler sets off again.
  let back = await snap();
  for (let i = 0; i < 80 && back.phase !== 'BOWLER_RUNUP' && back.phase !== 'INNINGS_END'; i++) { await advance(50); back = await snap(); }
  if (back.phase === 'BOWLER_RUNUP') {
    const home = await field();
    const off = home.fielders.filter(f => f.name !== first.catcher && f.home > .3);
    check(off.length === 0, 'everyone else is back on his mark for the next ball', JSON.stringify(off));
  }
}
check(walked, 'the field walked in at least once');
check(!!dived, 'a skied ball sent somebody running and diving for it', wickets ? `${wickets} catches, none of them diving` : 'no catches');
check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
