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
 * the card at the end headed SUPER10 and saying it does not count yet, with
 * nothing sent to a board or a career: Super10 has neither yet. And the field:
 * the first over's card going up before the first ball, each over's field set
 * for its bowler with the bowler signalling the change, Power Surge taken with
 * P in the break before the sixth over and two men brought in for it, the
 * field drawn in the pause sheet, and `?fieldui=a`'s map at the foot with no
 * card.
 *
 * The actions themselves are looked at in `bowler-sheet.html`
 * (`scripts/bowler-sheet.mjs`): a frame there is the frame asked for, which a
 * software-rendered game's clock does not promise.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

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

// In small steps: the opener is named only until the first ball is bowled.
const first = await until(['READY'], 800, 16);
check(first.super10 !== null, '?mode=super10 starts a Super10 innings', JSON.stringify(first.super10));
check(first.super10?.practising === true, 'and it is counted as practice until it has a board');
const opener = await page.locator('#phase-label').textContent();
check(first.balls === 0 && !!opener?.startsWith('OPENER IN'), 'the opener is named as he walks out', `${opener} (balls ${first.balls})`);
check(first.super10?.card === true && first.super10.field?.id === 'SWING-pp', 'the first over\'s field goes up on its card before the first ball',
  JSON.stringify(first.super10?.field));

const ACTION = { PACE: 'pace', SPIN: 'pace', EXPRESS: 'express', DEATH: 'death' };
const kinds = [];
const actions = {};
const speeds = [];
const fields = [];
let armed = null, pauseMap = false;
const signals = [];
const write = balls => page.evaluate(b => window.__cricket.blast(b), balls);
// Who bowls each over is read off the game at its top; one real ball is bowled
// for each kind of bowler — the swing bowler's, the spinner's, the sling
// bowler's and the death bowler's — to see the action he runs in with, and the
// rest of the innings is written through the debug hook: ten overs cannot be
// batted in software. The second over's are written with a wicket in them.
const REAL = new Set([0, 3, 4, 7]);
for (let over = 0; over < 10; over++) {
  const ready = await until(['READY', 'INNINGS_END']);
  if (ready.phase === 'INNINGS_END') break;
  kinds[over] = ready.super10.bowler;
  fields[over] = ready.super10.field;
  if (over === 1 || over === 2) signals.push(ready.super10.signalling);
  // Power Surge, taken in the break before the sixth over, which it is for.
  if (over === 5) {
    await page.keyboard.press('p');
    armed = (await snap()).super10.surge;
    fields[5] = (await snap()).super10.field;
  }
  if (over === 3) {
    // The field in the pause sheet.
    await page.keyboard.press('Escape');
    pauseMap = await page.locator('#s10-pause svg').isVisible();
    await page.keyboard.press('Escape');
  }
  if (over === 2) {
    const label = await page.locator('#phase-label').textContent();
    check(!!label?.startsWith('NO. 3 IN'), 'after a wicket the No. 3 is named walking out', label);
  }
  let left = 6;
  if (REAL.has(over)) {
    const runup = await until(['BOWLER_RUNUP'], 400, 16);
    actions[over] = { kind: runup.super10.bowler, action: runup.super10.action, death: runup.super10.death, express: runup.super10.express };
    const flight = await until(['BALL_IN_FLIGHT']);
    speeds.push(await page.locator('#speed').textContent());
    await advance(flight.contactAt - flight.elapsed - 40);
    await page.keyboard.press('s');
    const after = await until(['READY', 'INNINGS_END']);
    if (after.phase === 'INNINGS_END') break;
    left = 6 - (after.balls % 6);
  }
  const rest = Array(left).fill(0);
  if (over === 1) rest[0] = 'W';
  await write(rest);
  await advance(300);
}

await until(['INNINGS_END'], 200);
const final = await snap();
check(final.balls === 60 || final.wickets === 3, 'the innings ends at ten overs or three wickets', `${final.runs}/${final.wickets} off ${final.balls}`);

// The schedule: swing, seam, swing, spin, sling, spin and seam either way, death, sling, death.
const want = ['PACE', 'PACE', 'PACE', 'SPIN', 'EXPRESS', null, null, 'DEATH', 'EXPRESS', 'DEATH'];
const middle = [kinds[5], kinds[6]].sort().join(',');
check(kinds.every((k, i) => want[i] === null || want[i] === k) && (kinds.length < 7 || middle === 'PACE,SPIN'),
  'the five bowlers come on in the schedule\'s order', kinds.join(' '));
const real = Object.values(actions);
check(real.length === REAL.size && real.every(o => o.action === ACTION[o.kind]),
  'the swing, spin, sling and death bowlers each run in with their own action', JSON.stringify(actions));
check(real.every(o => o.death === (o.kind === 'DEATH') && o.express === (o.kind === 'EXPRESS')),
  'and the death and sling bowlers\' balls are flagged as theirs');
const BOWLER = { PACE: ['SWING', 'SEAM'], SPIN: ['SPIN'], EXPRESS: ['SLING'], DEATH: ['DEATH'] };
check(fields.length >= 8 && fields.every((f, i) => f && BOWLER[kinds[i]].includes(f.bowler)), 'each over\'s field is set for its bowler',
  fields.map(f => f?.id).join(' '));
check(fields.slice(0, 3).every(f => f.deep.length === 2) && fields.slice(3, 5).every(f => f.deep.length === 4),
  'with two men back in the Powerplay and four after it');
check(signals.some(Boolean), 'the bowler signals a change of field between overs', JSON.stringify(signals));
// Four men back, less the two the surge brings in.
check(armed === 5 && fields[5]?.change === 'surge' && fields[5].deep.length === 2,
  'Power Surge taken with P before the sixth over brings two men in for it', `${armed} ${JSON.stringify(fields[5])}`);
check(fields.slice(6).every(f => f?.change !== 'surge'), 'and it is one over only: the ninth does not switch it on again');
check(pauseMap, 'the field is drawn in the pause sheet');
check(speeds.every(v => /^\d+$/.test(v ?? '')), 'the speed gun reads out every ball', speeds.slice(0, 12).join(' '));

const card = await page.locator('#end').textContent().catch(() => '');
const heading = `${await page.locator('#end-mode').textContent()} · ${await page.locator('#end-label').textContent()}`;
check(heading === 'SUPER10 · 10 OVERS', 'the card is headed SUPER10 · 10 OVERS', heading);
const note = (await page.locator('#card-board-head').textContent()) ?? '';
check(/still being built/i.test(note), 'and says Super10 does not count yet', note);
check(!/best stands/i.test(card ?? ''), 'and quotes no Blast best on it');
check(sent.length === 0, 'nothing is sent to a board or a career', sent.join(', '));

// `?fieldui=a`: the map always at the foot, and no card.
await page.goto(`${base}/?debug=1&mode=super10&seed=778&fieldui=a`, { waitUntil: 'load' });
for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('#start') && !!window.__cricket)); i++) {
  if (await anyway.count()) await anyway.first().click().catch(() => {});
  await advance(300); await page.waitForTimeout(200);
}
await page.locator('#start').click({ force: true });
const a = await until(['READY'], 800, 16);
check(a.super10?.ui === 'a' && a.super10.card === false && await page.locator('#s10-foot svg').isVisible(),
  '?fieldui=a keeps the field at the foot and puts up no card', JSON.stringify({ ui: a.super10?.ui, card: a.super10?.card }));
check(errors.length === 0, 'no errors on the page', errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nAll good');
process.exit(failures ? 1 : 0);
