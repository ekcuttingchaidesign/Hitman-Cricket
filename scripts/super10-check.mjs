/**
 * Super10, in a real browser, by its link.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/super10-check.mjs
 *   node scripts/super10-check.mjs http://…:4173      # a preview build
 *
 * What no unit test can see: `?mode=super10` starting a ten-over innings, the
 * five bowlers coming on over by over in the schedule's order — each with his
 * own action at the top of his mark, the death bowler's above all — the speed
 * gun on every ball, the next batter named as he walks out after a wicket, and
 * the card at the end calling it practice, with nothing sent to a board or a
 * career: Super10 has neither yet.
 *
 * It lets the first balls go by until one takes a wicket, then blocks every
 * ball to the end. With `SHOTS=dir` it photographs the death bowler's loop and
 * hop from the batter's end.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.addInitScript(() => {
  try {
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
  } catch { /* Then the coachmarks show, and the check stops at them. */ }
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Anything that puts an innings on a board or counts it toward a career.
const sent = [];
page.on('request', request => {
  const { pathname } = new URL(request.url());
  if (request.method() !== 'GET' && /^\/api\/(score|career|survive|innings|marathon)/.test(pathname)) sent.push(pathname);
});

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const until = async (phases, tries = 120, step = 150) => {
  for (let i = 0; i < tries; i++) {
    const seen = await snap();
    if (phases.includes(seen.phase)) return seen;
    await advance(step);
  }
  throw new Error(`Never reached ${phases}: ${JSON.stringify(await snap())}`);
};

await page.clock.install();
await page.goto(`${base}/?debug=1&mode=super10&seed=777`, { waitUntil: 'load' });
await advance(2500);
await page.waitForTimeout(800);
// Headless Chromium looks like a private window: past its notice, as the other checks go.
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }
await page.locator('#start').click({ force: true });
await advance(600);

const first = await until(['READY']);
check(first.super10 !== null, '?mode=super10 starts a Super10 innings', JSON.stringify(first.super10));
check(first.super10?.practising === true, 'and it is counted as practice until it has a board');
check((await page.locator('#phase-label').textContent())?.startsWith('OPENER IN'), 'the opener is named as he walks out', await page.locator('#phase-label').textContent());

const ACTION = { PACE: 'pace', SPIN: 'pace', EXPRESS: 'express', DEATH: 'death' };
const overs = [];
const speeds = [];
const write = balls => page.evaluate(b => window.__cricket.blast(b), balls);
let photographed = false;
// One real ball an over, to see who bowls it and with what, and the other five
// written through the debug hook: ten overs cannot be batted in software. The
// second over's are written with a wicket in them, for the No. 3.
for (let over = 0; over < 10; over++) {
  const ready = await until(['READY', 'INNINGS_END']);
  if (ready.phase === 'INNINGS_END') break;
  if (over === 2) {
    const label = await page.locator('#phase-label').textContent();
    check(!!label?.startsWith('NO. 3 IN'), 'after a wicket the No. 3 is named walking out', label);
  }
  // In small steps, so the run-up is caught within a frame of its start.
  const runup = await until(['BOWLER_RUNUP'], 400, 16);
  const s10 = runup.super10;
  overs[s10.over] = { kind: s10.bowler, action: s10.action, death: s10.death, express: s10.express };
  // The death bowler's run, loop, hop and release, from the batter's end, once.
  if (shots && s10.death && !photographed) {
    photographed = true;
    const from = runup.elapsed;
    for (const [at, name] of [[.30, 'run'], [.46, 'loop'], [.52, 'top'], [.64, 'hop'], [.90, 'gather'], [.99, 'release']]) {
      await advance(from + 840 * at - (await snap()).elapsed);
      await page.screenshot({ path: `${shots}/death-${name}.png` });
    }
  }
  const flight = await until(['BALL_IN_FLIGHT']);
  speeds.push(await page.locator('#speed').textContent());
  await advance(flight.contactAt - flight.elapsed - 40);
  await page.keyboard.press('s');
  const after = await until(['READY', 'INNINGS_END']);
  if (after.phase === 'INNINGS_END') break;
  const rest = Array(6 - (after.balls % 6)).fill(0);
  if (over === 1 && rest.length) rest[0] = 'W';
  if (rest.length && rest.length < 6) await write(rest);
  await advance(300);
}

await until(['INNINGS_END'], 200);
const final = await snap();
check(final.balls === 60 || final.wickets === 3, 'the innings ends at ten overs or three wickets', `${final.runs}/${final.wickets} off ${final.balls}`);

// The schedule: swing, seam, swing, spin, sling, spin and seam either way, death, sling, death.
const kinds = overs.map(o => o?.kind);
const want = ['PACE', 'PACE', 'PACE', 'SPIN', 'EXPRESS', null, null, 'DEATH', 'EXPRESS', 'DEATH'];
const middle = [kinds[5], kinds[6]].sort().join(',');
check(kinds.every((k, i) => want[i] === null || want[i] === k) && (kinds.length < 7 || middle === 'PACE,SPIN'),
  'the five bowlers come on in the schedule\'s order', kinds.join(' '));
check(overs.length === 10 && overs.every(o => o.action === ACTION[o.kind]),
  'each over is bowled with its bowler\'s action at the top of his mark', overs.map(o => o && o.action).join(' '));
check(overs.every(o => o.death === (o.kind === 'DEATH') && o.express === (o.kind === 'EXPRESS')),
  'and the death and sling overs\' balls are flagged as theirs');
check(speeds.every(v => /^\d+$/.test(v ?? '')), 'the speed gun reads out every ball', speeds.slice(0, 12).join(' '));

const card = await page.locator('#end').textContent().catch(() => '');
check(/practice/i.test(card ?? ''), 'the card calls the innings practice', (card ?? '').slice(0, 160));
check(sent.length === 0, 'nothing is sent to a board or a career', sent.join(', '));
check(errors.length === 0, 'no errors on the page', errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nAll good');
process.exit(failures ? 1 : 0);
