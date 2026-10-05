/**
 * The fielders against a ball along the ground, in a real browser, on a
 * phone: the drive that goes past a man close enough to dive for it and
 * beats him, the four that a man from the deep goes after, and the single
 * that somebody runs to and picks up — and no ball ever going through a man.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ground-check.mjs
 *   node scripts/ground-check.mjs http://…:4173    # a preview build
 *
 * The rules — which line a ball takes past the field, who dives, who chases,
 * who picks up — are held by `tests/field.test.ts`. This plays real balls on
 * a clock wound by hand and watches every fielder and the ball frame by
 * frame: drives that suit the line, on time for a four and a touch late for
 * the singles and twos that stop in the field. Its sister for catches is
 * `field-check.mjs`. Screenshots land in test-results/.
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
// A phone held upright, at one pixel to the point: see `field-check.mjs`.
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
await page.goto(`${base}/?debug=1&seed=271`, { waitUntil: 'load' });
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

/**
 * Keys pressed together and let go, stamped with the page's own time (see
 * `pull-check.mjs`): two at once is how the keyboard plays the drives
 * either side of straight.
 */
function press(keys) {
  return page.evaluate(keys => {
    for (const type of ['keydown', 'keyup']) for (const key of keys) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, keys);
}
/** The drive that suits the line: on, straight, cover, or the swipe either side. */
const STROKE = { OUTSIDE_LEG: ['a'], LEG: ['a', 'w'], MIDDLE: ['w'], OFF: ['w', 'd'], OUTSIDE_OFF: ['w', 'd'] };

let four = null, beaten = null, picked = null, settledEvery = 0;
const closest = { gap: Infinity, who: '' };
for (let ball = 0; ball < 24 && !(four && beaten && picked); ball++) {
  seen = await snap();
  // The bowler sets off only once everyone is back on his mark.
  for (let i = 0; i < 400 && seen.phase !== 'BOWLER_RUNUP' && seen.phase !== 'INNINGS_END'; i++) { await advance(25); seen = await snap(); }
  if (seen.phase === 'BOWLER_RUNUP') {
    // On his mark, or in the last couple of strides of his walk back, which
    // he takes while the bowler runs in.
    const off = (await field()).fielders.filter(f => f.home > .45 && !(f.action === 'Walking back' && f.home < 2));
    if (off.length) check(false, 'the bowler waits for the field to be back on its marks', JSON.stringify(off));
    else settledEvery++;
  }
  for (let i = 0; i < 120 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') break;
    await advance(100); seen = await snap();
  }
  if (seen.phase !== 'BALL_IN_FLIGHT') break;
  // On time is a four along the ground; a little late, a nudge into the field
  // for one, two or three. Alternate until each has been seen.
  const wantFour = !four || (picked && !beaten);
  const scored = seen.runs;
  await advance(seen.contactAt - seen.elapsed + (wantFour ? 55 : 100));
  await press(STROKE[seen.effectiveLine] ?? ['w']);
  const frames = [];
  let at = await snap();
  let photographed = false;
  for (let i = 0; i < 120 && at.phase !== 'READY' && at.phase !== 'INNINGS_END'; i++) {
    const now = { ...(await field()), t: at.elapsed, phase: at.phase };
    frames.push(now);
    const diving = now.fielders.find(f => f.action === 'Diving catch');
    if (!photographed && diving && now.ball) { photographed = true; await page.screenshot({ path: `test-results/ground-dive-${ball + 1}.png` }); }
    await advance(40);
    at = await snap();
  }
  const outcome = at.outcome;
  // Off the scoreboard, not the call: the call for a four is "FOUR!".
  const runs = at.runs - scored;
  const acted = name => frames.some(f => f.fielders.some(x => x.action === name));
  // Never through a man: while the ball is on the ground and moving, nobody's
  // hips are on top of it.
  for (const f of frames) {
    if (!f.ball || f.ball[1] > 1 || f.held) continue;
    for (const x of f.fielders) {
      const gap = Math.hypot(f.ball[0] - x.x, f.ball[2] - x.z);
      if (gap < closest.gap) { closest.gap = gap; closest.who = `${x.name} (${x.action}), ball ${ball + 1}`; }
    }
  }
  const chasers = [...new Set(frames.flatMap(f => f.fielders.filter(x => x.deep && (x.action === 'Chasing it' || x.action === 'Diving catch')).map(x => x.name)))];
  const divers = [...new Set(frames.flatMap(f => f.fielders.filter(x => x.action === 'Diving catch').map(x => x.name)))];
  console.log(`        ball ${ball + 1}: ${outcome} — divers ${JSON.stringify(divers)}, from the deep ${JSON.stringify(chasers)}${acted('Picking it up') ? ', picked up' : ''}`);
  if (runs === 4 && !four) {
    four = { chasers };
    check(chasers.length > 0, 'a four along the ground has somebody from the deep after it', outcome);
  }
  if (runs === 4 && divers.length && !beaten) {
    beaten = divers;
    check(divers.every(d => frames.some(f => f.fielders.some(x => x.name === d && x.action === 'Up, hands on head'))),
      'a man it passes close to dives, is beaten, and gets up with his hands on his head', JSON.stringify(divers));
  }
  if (runs >= 1 && runs <= 3 && !picked) {
    const pick = frames.find(f => f.held);
    picked = pick ?? false;
    // By a fielder, who throws it in to the bowler — or, stopping on the
    // pitch, by the bowler himself.
    check(!!pick, `a ball stopping in the field for ${runs} is run to and picked up`, `${outcome}${acted('Picking it up') ? '' : ' — nobody picked it up'}`);
    if (acted('Throwing it in')) check(true, 'and thrown in to the bowler');
    if (pick) {
      const gap = Math.hypot(pick.ball[0] - pick.held[0], pick.ball[1] - pick.held[1], pick.ball[2] - pick.held[2]);
      check(gap < .05, 'and then it is in his hand', `${gap.toFixed(2)}m`);
      await page.screenshot({ path: `test-results/ground-picked-${ball + 1}.png` });
    }
  }
}
check(settledEvery > 0, 'the bowler waits for the field to be back on its marks', `${settledEvery} balls`);
check(!!four, 'a four along the ground came');
check(!!beaten, 'somebody dived at one and was beaten');
check(!!picked, 'a ball that stopped in the field was picked up');
check(closest.gap > .45, 'and no ball went through a man', `${closest.gap.toFixed(2)}m from ${closest.who}`);
check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
