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
// Small, because every step of the wound clock draws frames and a headless browser
// draws them in software; what is measured here does not depend on the size.
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'rivals-launch:9');
    localStorage.setItem('hitman-unveiled', 'ground-2026');
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
  await done.click({ force: true });
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
for (let ball = 0; ball < 12 && !(dived && walked); ball++) {
  seen = await snap();
  for (let i = 0; i < 120 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') break;
    await advance(100); seen = await snap();
  }
  if (seen.phase !== 'BALL_IN_FLIGHT') break;
  if (!walked) {
    const now = await field();
    const ring = now.fielders.slice(0, 4);
    walked = ring.every(f => f.home > 1.2) && ring.some(f => f.action === 'Walking in' || f.action === 'Split step');
    check(walked, 'the ring walks in with the bowler', JSON.stringify(ring));
  }
  // Late enough to sky it, to the leg side, where midwicket has to go and get it.
  await advance(seen.contactAt - seen.elapsed + 165);
  await press('a');
  const frames = [];
  let at = await snap();
  for (let i = 0; i < 120 && at.phase !== 'RESULT' && at.phase !== 'READY' && at.phase !== 'INNINGS_END'; i++) {
    frames.push({ ...(await field()), t: at.elapsed });
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
  const near = frames.reduce((best, f) => (Math.abs(f.t - first.catchAt) < Math.abs(best.t - first.catchAt) ? f : best), frames[0]);
  const ball3 = near.ball, hands = first.hands;
  const gap = ball3 && hands ? Math.hypot(ball3[0] - hands[0], ball3[1] - hands[1], ball3[2] - hands[2]) : Infinity;
  console.log(`        ball ${ball + 1}: ${outcome} — ${first.catcher}, ${first.style}, from ${catcher.home}m off his mark`);
  check(catcher.home < 2.6, `${first.catcher} sets off from his own patch, not from under the ball`, JSON.stringify(catcher));
  check(worst <= 8.5, 'nobody moves faster than a sprint between frames', `${worst.toFixed(2)} m/s`);
  check(gap < .4, 'the ball comes down into his hands', `${gap.toFixed(2)}m — ball ${JSON.stringify(ball3)}, hands ${JSON.stringify(hands)}`);
  if (first.style === 'dive' && !dived) {
    dived = first;
    // Back to the moment he leaves the ground and the moment he takes it.
    const travelled = Math.hypot(near.fielders.find(f => f.name === first.catcher).x - catcher.x, near.fielders.find(f => f.name === first.catcher).z - catcher.z);
    check(travelled > 2, 'and he covers the ground to get there', `${travelled.toFixed(2)}m`);
  }
  if (first.style === 'high' && !settled) settled = first;
  await page.screenshot({ path: `test-results/field-catch-${ball + 1}.png` });
  // On to the next ball: the field goes back to its marks while the result is up.
  let back = await snap();
  for (let i = 0; i < 80 && back.phase !== 'READY' && back.phase !== 'INNINGS_END'; i++) { await advance(100); back = await snap(); }
  if (back.phase === 'READY') {
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
