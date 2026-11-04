/**
 * The action replay, in a real browser (`src/game/replay.ts`): a cover drive
 * timed on the keys for four in the Blast, every ball the cover drive's own
 * (`?cover=1`) and every one that qualifies replayed (`?replay=1`, which
 * `?debug=1` otherwise switches off). The replay comes up once the ball is
 * dead, the wipe in, the ball bowled again under the replay's camera, the
 * stroke and the ball away, the wipe out, and the next ball bowled only after
 * it; then a second is skipped with a tap. Photographed through, into
 * `test-results/replay-*.png`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/replay-check.mjs
 *
 * `MODE=super10` does it in Super10, `STROKE=pull` pulls a bouncer every ball, and `ANGLE=spider-legslip` (any of
 * `REPLAY_ANGLES`) shows it from that camera.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const mode = process.env.MODE === 'super10' ? 'super10' : 'classic';

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
const angle = process.env.ANGLE ? `&replayangle=${process.env.ANGLE}` : '';
// The cover drive at its own ball, the pull at a bouncer every ball
// (`STROKE=pull`), the straight drive at the cover drive's ball, lofted when
// it is perfectly timed (`STROKE=straight`), or the square cut at pace wide of
// off (`STROKE=cut`).
const STROKES = {
  cover: { ball: 'cover', keys: ['w', 'd'], said: 'a cover drive for four' },
  pull: { ball: 'bouncers', keys: ['a'], said: 'a bouncer pulled for a boundary' },
  straight: { ball: 'cover', keys: ['w'], said: 'a straight six' },
  cut: { ball: 'latecut', keys: ['d'], said: 'a square cut for four' },
  // Late cuts at pace on off stump or wider, until one on the stumps bowls him.
  bowled: { ball: 'latecut', keys: ['d', 's'], said: 'a batter bowled' },
};
const asked = STROKES[process.env.STROKE] ? process.env.STROKE : 'cover', played = STROKES[asked];
const keys = played.keys;
await page.goto(`${base}/?debug=1&seed=2718&${played.ball}=1&replay=1&lights=day${angle}`, { waitUntil: 'load' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
await advance(2500);
await page.waitForTimeout(800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
await page.locator('#start').click({ force: true, timeout: 15_000 });
await advance(600);
console.log("        cover up"); await page.locator(`#mode-${mode === 'super10' ? 'super10' : 'classic'}`).click({ force: true, timeout: 15_000 });
await advance(600);
await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });

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
  for (let i = 0; i < 200 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}
/** A cover drive on the keys, on time; then until the ball is dead, and the replay if one comes. */
async function drive() {
  const seen = await nextBall();
  if (!seen) return null;
  await advance(seen.contactAt - seen.elapsed);
  await press(...keys);
  let now = await snap();
  for (let i = 0; i < 80 && now.phase !== 'RESULT'; i++) { await advance(50); now = await snap(); }
  const outcome = now.outcome;
  for (let i = 0; i < 60 && !now.replay && now.phase === 'RESULT'; i++) { await advance(50); now = await snap(); }
  return { outcome, grade: now.timingGrade, replay: now.replay };
}

console.log("        at the crease"); let shown = null, shots = 0;
for (let ball = 0; ball < (asked === 'bowled' ? 30 : 12) && !shown; ball++) {
  const played = await drive();
  if (!played) break;
  console.log(`        ball ${ball + 1}: ${played.outcome} (${played.grade}) ${played.replay ? '→ replay' : ''}`);
  if (played.replay && (asked !== 'bowled' || played.replay.stroke === 'bowled')) shown = played;
}
check(!!shown, `${played.said} is replayed once the ball is dead`, shown && JSON.stringify(shown));
if (shown) {
  check(shown.replay.stroke === asked, `as the ${asked}`, JSON.stringify(shown.replay));
  if (process.env.ANGLE) check(shown.replay.angle === process.env.ANGLE, 'from the camera asked for', JSON.stringify(shown.replay));
  else check(!!shown.replay.angle, 'from one of its cameras', JSON.stringify(shown.replay));
  // Through it, photographing as it goes.
  let now = await snap(), staged = false, struck = false, bars = false, tag = false;
  const moments = [0, 300, 600, 900, 1300, 1800, 2400, 3000];
  for (let i = 0; i < 400 && now.replay; i++) {
    await advance(40); now = await snap();
    if (now.replay?.at != null) {
      staged = true;
      if (!bars) bars = await page.evaluate(() => document.getElementById('viewport').classList.contains('intro-on'));
      if (!tag) tag = await page.locator('#replay-tag').isVisible().catch(() => false);
      if (now.replay.struck) struck = true;
      if (moments.length && now.replay.at >= moments[0]) { moments.shift(); await page.screenshot({ path: `test-results/replay-${mode}${asked === 'cover' ? '' : `-${asked}`}-${++shots}.png` }); }
    }
    if (now.phase !== 'RESULT' && now.replay) { check(false, 'the next ball waits for it', now.phase); break; }
  }
  check(true, 'the next ball waits for it');
  check(staged && struck, 'the ball is bowled again and struck under the replay', JSON.stringify({ staged, struck }));
  check(bars && tag, 'between the bars, the REPLAY tag up', JSON.stringify({ bars, tag }));
  for (let i = 0; i < 40 && now.phase === 'RESULT'; i++) { await advance(50); now = await snap(); }
  const back = await page.evaluate(() => ({ bars: document.getElementById('viewport').classList.contains('intro-on'), tag: !!document.getElementById('replay-tag') }));
  check(!now.replay && !back.bars && !back.tag, 'and it hands back to the game', JSON.stringify(back));
  const next = await nextBall();
  check(!!next, 'and the next ball is bowled');
  await page.screenshot({ path: `test-results/replay-${mode}-after.png` });

  // A second, skipped with a tap. Every ball is replayed here, so the next four is one.
  let second = null;
  if (next && asked !== 'bowled') {
    await advance(next.contactAt - next.elapsed); await press(...keys);
    for (let ball = 0; ball < 10 && !second; ball++) {
      let at = await snap();
      for (let i = 0; i < 120 && !at.replay && at.phase !== 'BALL_IN_FLIGHT' && at.phase !== 'INNINGS_END'; i++) { await advance(50); at = await snap(); }
      if (at.replay) { second = at; break; }
      const played = await drive();
      if (!played) break;
      if (played.replay) second = await snap();
    }
  }
  if (asked !== 'bowled') check(!!second, 'another four is replayed');
  if (second) {
    for (let i = 0; i < 40 && (await snap()).replay?.at == null; i++) await advance(40);
    await advance(300);
    await page.touchscreen.tap(195, 420);
    let gone = await snap();
    for (let i = 0; i < 20 && gone.replay; i++) { await advance(50); gone = await snap(); }
    check(!gone.replay, 'and a tap skips it', JSON.stringify(gone.replay));
  }
}
check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
