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

/** A few balls of a Blast, enough that counting them would show: 4 6 1, eleven runs. */
const SOME = [4, 6, 1];
/** The rest of a Blast to its thirtieth ball, without a wicket. */
const REST = Array.from({ length: 27 }, (_, i) => [1, 0, 4][i % 3]);

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
    // Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
    localStorage.setItem('hitman-shots-intro', 'done');
    // Past the What's new stories, which play on a 3D stage — seconds a frame in
    // software — and whose way on is a key to the Dressing Room, not the modes.
    localStorage.setItem('hitman-whatsnew', 'dressing-room:9');
    // A private window counts no career at all, and a headless browser reads as
    // one. A visit remembered from an earlier day is the tell that settles it.
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
  } catch { /* Then nothing counts. */ }
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const snap = () => page.evaluate(() => window.__cricket.snapshot());
/** A key pressed in the page itself, as a tap lands on it. */
const tap = id => page.evaluate(id => {
  const key = document.getElementById(id);
  if (!key) throw new Error(`No #${id} on screen`);
  key.click();
}, id);

/**
 * The career this browser holds, which the counting path writes when the store
 * answers. Nought where nothing has been counted, which is the whole point.
 */
const career = async () => page.evaluate(() => {
  try {
    const held = JSON.parse(localStorage.getItem('hitman-career') ?? '{}');
    const mine = held.classic ?? {};
    return { innings: Number(mine.innings) || 0, runs: Number(mine.runs) || 0 };
  } catch { return { innings: 0, runs: 0 }; }
});

/**
 * Balls written through the debug hook (`__cricket.blast`) between deliveries,
 * rather than batted: batting a ball takes the better part of a minute in a
 * software-rendered browser, and what this check holds is not how a run is
 * made but which way out of an innings counts it. Walking out is the real R
 * key and finishing is the real end of the innings, through `end`.
 */
const write = async balls => {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(balls => window.__cricket.blast(balls), balls)) return (await snap()).runs;
    await page.waitForTimeout(250);
  }
  throw new Error(`Never between deliveries: ${JSON.stringify(await snap())}`);
};
const walkOut = async () => {
  await page.keyboard.press('r');
  await page.waitForTimeout(1500);
};

await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }

// In by the cover's PLAY and Choose a mode, as a player comes in.
await tap('start');
for (let i = 0; i < 40 && !(await page.locator('#mode-classic').isVisible().catch(() => false)); i++) await page.waitForTimeout(250);
await tap('mode-classic');
await page.waitForTimeout(800);

check((await career()).innings === 0, 'nothing is counted before an innings is played');

// ── Walked out on, having scored ───────────────────────────────────────────
const abandoned = await write(SOME);
check(abandoned > 0, 'some runs are on the board', `${abandoned}`);
await walkOut();
check((await snap()).runs === 0, 'restarting starts again at nought');
await page.waitForTimeout(3000);
const afterWalkOut = await career();
check(afterWalkOut.innings === 0 && afterWalkOut.runs === 0,
  'and the innings walked out on counts for nothing', JSON.stringify(afterWalkOut));

// ── Played to the end ──────────────────────────────────────────────────────
await write(SOME);
const finished = await write(REST);
for (let i = 0; i < 40 && (await snap()).phase !== 'INNINGS_END'; i++) await page.waitForTimeout(250);
check((await snap()).phase === 'INNINGS_END', 'thirty balls end the innings');
for (let i = 0; i < 40 && (await career()).innings === 0; i++) await page.waitForTimeout(250);
const counted = await career();
check(counted.innings === 1, 'an innings played to the end counts once', JSON.stringify(counted));
check(counted.runs === finished, 'for exactly what it scored', `career ${counted.runs} vs innings ${finished}`);

// ── Walked out on again, with a career already there ───────────────────────
// The first walk-out proves nothing is created. This proves nothing is added:
// a total that already exists is the one an abandoned innings could inflate.
await tap('again');
await page.waitForTimeout(800);
const second = await write(SOME);
check(second > 0, 'a second innings is under way and scoring', `${second}`);
await walkOut();
await page.waitForTimeout(3000);
const still = await career();
check(still.innings === counted.innings && still.runs === counted.runs,
  'and walking out adds nothing to the career already held',
  `was ${JSON.stringify(counted)}, now ${JSON.stringify(still)}`);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-pending-innings') ?? '[]').length) === 0,
  'and leaves nothing waiting to be sent');

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
