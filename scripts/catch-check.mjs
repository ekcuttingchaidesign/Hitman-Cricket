/**
 * The catch camera, in a real browser (`src/game/catch-cam.ts`): every ball
 * the cover drive's own (`?cover=1`), the keys pressed early enough to sky it
 * (POOR), and the camera on under `?debug=1` (`?catchcam=1`). The game's own
 * picture off the bat, then the cut to the camera between the bars, slowed
 * round the take, the field with men behind square, and the cut back to the
 * game, the call going up over the camera's picture as he takes it and the
 * next ball after the cut back.
 * Photographed through, into `test-results/catch-*.png`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/catch-check.mjs
 *
 * `MODE=survive` does it in Test Survival, where a skier not held is put
 * down (`skied` in `Survive.ts`): it bats until it has seen one of each.
 * `MODE=super10 FIELD=1` pulls every bouncer (`?bouncers=1`) a shade early
 * instead, until a boundary rider cuts one off or saves it out of the game's
 * picture and the camera follows it to him (`'field'`).
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const mode = ['survive', 'super10'].includes(process.env.MODE) ? process.env.MODE : 'classic';
const fielding = mode === 'super10' && process.env.FIELD === '1';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR ?? 1), isMobile: true, hasTouch: true });
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-field-intro', 'done');
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'rivals:9');
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
/** A new innings on `seed`: Survival has one wicket, so a seed whose first skier is held is put down for another. */
async function open(seed) {
  await page.goto(`${base}/?debug=1&seed=${seed}&${fielding ? 'bouncers' : 'cover'}=1&catchcam=1&replay=0&lights=day`, { waitUntil: 'load' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
  await advance(2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.locator(`#mode-${mode}`).click({ force: true, timeout: 15_000 });
  await advance(600);
}

function press(...keys) {
  return page.evaluate(keys => {
    for (const type of ['keydown', 'keyup']) for (const key of keys) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, keys);
}
async function nextBall() {
  let seen = await snap();
  for (let i = 0; i < 300 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}
const bars = () => page.evaluate(() => document.getElementById('viewport').classList.contains('intro-on'));
const said = () => page.evaluate(() => document.getElementById('result-text')?.textContent ?? '');

/** The cover drive played early enough to sky it; then the ball followed to its end. */
async function sky(name) {
  const seen = await nextBall();
  if (!seen) return null;
  await advance(seen.contactAt - seen.elapsed - (fielding ? 62 : mode === 'survive' ? 120 : 150));
  await press(...(fielding ? ['a'] : ['w', 'd']));
  let now = await snap();
  for (let i = 0; i < 80 && now.phase === 'BALL_IN_FLIGHT'; i++) { await advance(30); now = await snap(); }
  const outcome = now.outcome;
  if (!now.catchCam) {
    for (let i = 0; i < 120 && now.phase !== 'READY' && now.phase !== 'INNINGS_END'; i++) { await advance(80); now = await snap(); }
    return { outcome, cam: null };
  }
  const cam = { shot: now.catchCam.shot, cutAfterBat: false, onBars: false, slowed: false, held: false, men: 0, calledEarly: false, calledAtTake: false, shots: 0 };
  // The game's picture off the bat, before the cut.
  cam.cutAfterBat = !now.catchCam.on;
  const moments = [-900, -450, -120, 150, 500];
  for (let i = 0; i < 400 && now.catchCam; i++) {
    const was = now.elapsed;
    await advance(40); now = await snap();
    if (!now.catchCam) break;
    if (now.catchCam.on) {
      if (!cam.onBars) cam.onBars = await bars();
      const field = await page.evaluate(() => window.__cricket.field());
      cam.men = Math.max(cam.men, field.fielders?.length ?? field.men?.length ?? 0);
      if (Math.abs(now.catchCam.sinceTake) < 200 && now.elapsed - was < 30) cam.slowed = true;
      const up = /CAUGHT|DROPPED|RUN/.test(await said()) && await page.locator('#result').isVisible();
      if (up && now.catchCam.sinceTake < -80) cam.calledEarly = true;
      if (up && now.catchCam.sinceTake >= 0) cam.calledAtTake = true;
      if (moments.length && now.catchCam.sinceTake >= moments[0]) { moments.shift(); await page.screenshot({ path: `test-results/catch-${mode}-${name}-${++cam.shots}.png` }); }
    }
    if (now.phase === 'RESULT' || now.phase === 'READY') { cam.held = false; break; }
    cam.held = true;
  }
  cam.back = !(await bars());
  cam.call = await said();
  await page.screenshot({ path: `test-results/catch-${mode}-${name}-after.png` });
  return { outcome, cam };
}

const seen = {};
const done = () => fielding ? seen.field : seen.catch && (mode !== 'survive' || seen.drop);
for (const seed of [2718, 31, 577, 1009, 4242, 8, 919, 3141]) {
  if (done()) break;
  await open(seed);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  for (let ball = 0; ball < (fielding ? 60 : 30) && !done(); ball++) {
    const played = await sky(`${seed}-${ball + 1}`);
    if (!played) break;
    console.log(`        seed ${seed} ball ${ball + 1}: ${played.outcome} ${played.cam ? `→ ${played.cam.shot} ${JSON.stringify(played.cam)}` : ''}`);
    if (played.cam && !seen[played.cam.shot]) seen[played.cam.shot] = played.cam;
  }
}
for (const shot of fielding ? ['field'] : mode === 'survive' ? ['catch', 'drop'] : ['catch']) {
  const cam = seen[shot];
  check(!!cam, shot === 'field' ? 'a ball a boundary rider got to out of the picture has the camera go with it' : `a skier ${shot === 'catch' ? 'caught' : 'put down'} has the camera go with it`);
  if (!cam) continue;
  check(cam.cutAfterBat, 'the game\'s own picture off the bat, before the cut');
  check(cam.onBars, 'between the bars');
  check(cam.slowed, 'slowed round the take');
  check(cam.held, 'the ball is not dead while it is up');
  check(!cam.calledEarly && cam.calledAtTake, 'the call goes up as he takes it, over the camera\'s picture', JSON.stringify({ early: cam.calledEarly, atTake: cam.calledAtTake }));
  check(cam.back, 'and it cuts back to the game');
  check(shot === 'field' ? /RUN/.test(cam.call) : shot === 'catch' ? /CAUGHT/.test(cam.call) : /DROPPED/.test(cam.call), 'with the call up then', cam.call);
}
const next = await nextBall();
check(!!next || (await snap()).phase === 'INNINGS_END', 'and the next ball is bowled');
check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
