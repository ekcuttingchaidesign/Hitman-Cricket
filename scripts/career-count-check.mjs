/**
 * Only a finished innings counts toward a career.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/career-count-check.mjs                  # that dev server
 *   node scripts/career-count-check.mjs http://…:4173    # a preview build
 *
 * A career board says "all time", so it adds every innings up rather than
 * keeping the best one — which makes an innings walked out on a different kind
 * of problem here than it is on the innings boards. There, an abandoned innings
 * is simply a low score that never displaces anything. Here, if it counted, a
 * player could stack runs by restarting on every good over and never once
 * facing the ball that gets them out, and the total would be of their best
 * overs rather than of their innings.
 *
 * The game already only counts at the end: there is one call that counts an
 * innings, in `end`, which runs when the innings is actually over. This script
 * is what stops that quietly ceasing to be true. It is a control-flow rule
 * rather than a function with an answer, so no unit test can hold it — what
 * holds it is playing some of an innings, walking out, and looking at what the
 * career says afterwards.
 *
 * It needs no database. The dev server keeps careers in memory, which is enough
 * to watch a total move or stay still.
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
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const until = async phase => {
  for (let i = 0; i < 60; i++) {
    const seen = await snap();
    if (seen.phase === phase) return seen;
    await advance(300);
  }
  throw new Error(`Never reached ${phase}: ${JSON.stringify(await snap())}`);
};

/**
 * The career this browser holds, which the counting path writes when the store
 * answers. Nought where nothing has been counted, which is the whole point.
 */
const career = async () => page.evaluate(() => {
  try {
    const held = JSON.parse(localStorage.getItem('hitman-career') ?? '{}');
    const mine = held.survive ?? {};
    return { innings: Number(mine.innings) || 0, runs: Number(mine.runs) || 0 };
  } catch { return { innings: 0, runs: 0 }; }
});

/** Some runs, without finishing. Enough that counting them would show. */
const playOn = async balls => {
  for (let i = 0; i < balls; i++) {
    const ball = await until('BALL_IN_FLIGHT');
    const key = ball.effectiveLine === 'MIDDLE' ? 'w' : Number(ball.finalX) < 0 ? 'a' : 'd';
    await advance(ball.contactAt - ball.elapsed - 65);
    await page.keyboard.press(key);
    await advance(2600);
  }
  return (await snap()).runs;
};

// A private window counts no career at all, and a headless browser reads as
// one. A visit remembered from an earlier day is the tell that settles it.
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then nothing counts. */ }
});

await page.clock.install();
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await advance(2500);
await page.waitForTimeout(800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }

await page.locator('#start').click({ force: true });
await advance(400);
await page.waitForTimeout(300);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await advance(400);
  await page.waitForTimeout(200);
}
await page.locator('#mode-survive').click({ force: true });
await advance(600);
await page.waitForTimeout(400);

check((await career()).innings === 0, 'nothing is counted before an innings is played');

// ── Walked out on, having scored ───────────────────────────────────────────
const abandoned = await playOn(3);
check(abandoned > 0, 'some runs are on the board', `${abandoned}`);
await page.keyboard.press('r');
await advance(600);
await page.waitForTimeout(1500);
check((await snap()).runs === 0, 'restarting starts again at nought');
const afterWalkOut = await career();
check(afterWalkOut.innings === 0 && afterWalkOut.runs === 0,
  'and the innings walked out on counts for nothing', JSON.stringify(afterWalkOut));

// ── Played to the end ──────────────────────────────────────────────────────
await playOn(3);
await page.evaluate(() => window.__cricket.hurt());
for (let i = 0; i < 40; i++) {
  if ((await snap()).phase === 'INNINGS_END') break;
  await advance(1500);
}
const finished = (await snap()).runs;
await page.waitForTimeout(2500);
const counted = await career();
check(counted.innings === 1, 'an innings played to the end counts once', JSON.stringify(counted));
check(counted.runs === finished, 'for exactly what it scored', `career ${counted.runs} vs innings ${finished}`);

// ── Walked out on again, with a career already there ───────────────────────
// The first walk-out proves nothing is created. This proves nothing is added:
// a total that already exists is the one an abandoned innings could inflate.
await page.locator('#survive-again').click({ force: true });
await advance(600);
await page.waitForTimeout(400);
const second = await playOn(2);
check(second > 0, 'a second innings is under way and scoring', `${second}`);
await page.keyboard.press('r');
await advance(600);
await page.waitForTimeout(1500);
const still = await career();
check(still.innings === counted.innings && still.runs === counted.runs,
  'and walking out adds nothing to the career already held',
  `was ${JSON.stringify(counted)}, now ${JSON.stringify(still)}`);

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
