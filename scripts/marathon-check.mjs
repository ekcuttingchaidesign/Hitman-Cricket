/**
 * Test Marathon, in a real browser, reached the way a player reaches it.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/marathon-check.mjs                  # that dev server
 *   node scripts/marathon-check.mjs http://…:4173    # a preview build
 *
 * What no unit test can see: the batter named on the screen as he walks out,
 * the next one standing at his guard with a full meter after the last was
 * carried off, the declare key on the pause card from the twentieth over and
 * not a ball before, the card at the end with all three batters on it — and
 * nothing sent anywhere. The Marathon has no board and no career yet, so an
 * innings of it, finished or walked out on, must not reach a single endpoint
 * that keeps one.
 *
 * Twenty overs cannot be batted in a software-rendered browser, so the innings
 * is written out ball by ball through `__cricket.marathon` between deliveries,
 * with real balls bowled and played on either side of each jump.
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
// Anything that keeps a score: the boards, the careers, the innings counter.
const kept = [];
page.on('request', request => {
  const { pathname } = new URL(request.url());
  if (/^\/api\/(score|innings|career|survive)/.test(pathname) && request.method() !== 'GET') kept.push(pathname);
});

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const until = async phase => {
  for (let i = 0; i < 80; i++) {
    const seen = await snap();
    if (seen.phase === phase) return seen;
    await advance(300);
  }
  throw new Error(`Never reached ${phase}: ${JSON.stringify(await snap())}`);
};
const label = () => page.locator('#phase-label').textContent();
const write = balls => page.evaluate(b => window.__cricket.marathon(b), balls);
const ones = n => Array(n).fill(1);

/** One real ball, blocked, and played out to the next guard or the end. */
const block = async () => {
  const ball = await until('BALL_IN_FLIGHT');
  await advance(ball.contactAt - ball.elapsed - 40);
  await page.keyboard.press('s');
  for (let i = 0; i < 30; i++) {
    await advance(400);
    const now = await snap();
    if (now.phase === 'READY' || now.phase === 'INNINGS_END') return now;
  }
  return snap();
};
const pause = async () => { await page.locator('#pause').click({ force: true }); await advance(200); };
const resume = async () => { await page.locator('#resume').click({ force: true }); await advance(200); };
const declareShown = () => page.locator('#declare').isVisible();

await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then it is a first visit. */ }
  try { localStorage.setItem('hitman-unveiled', 'ground-stadium'); } catch { /* Then they stand in the way. */ }
});

await page.clock.install();
await page.goto(`${base}/?debug=1&mode=marathon&seed=4242`, { waitUntil: 'load' });
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

// ── The opener walks out ───────────────────────────────────────────────────
// Getting past the cover can take long enough for a ball to be bowled at an
// opener nobody is batting for. A restart is the guard of a fresh innings.
await until('READY');
await page.keyboard.press('r');
await advance(16);
const first = await snap();
check(first.marathon?.batter === 'OPENER', 'a Marathon starts with the opener in', JSON.stringify(first.marathon));
check((await label())?.includes('OPENER IN'), 'and says so as he takes guard', await label());
check(first.marathon?.level === 1 && first.marathon?.bowler === 'PACE', 'against Level 1 pace', JSON.stringify(first.marathon));
check(await page.locator('#confidence').evaluate(el => el.classList.contains('is-injury')), 'with the injury meter, not confidence');
check(await page.locator('#scoreboard').isVisible(), 'and the scoreboard, not a target to chase');
await block();
check(!(await label())?.includes('OPENER IN'), 'said once, and not again the next ball', await label());

// ── A wicket brings the No. 3 ──────────────────────────────────────────────
let state = await write([...ones(39), 'W']);
check(state.batter === 'NO_3' && state.gone === 1, 'a wicket sends the No. 3 in', JSON.stringify(state));
check(state.batters[0] === '39', 'with the opener out for what he made', JSON.stringify(state.batters));
check((await label())?.includes('NO. 3 IN'), 'named as he walks out', await label());
await block();

// ── Felled or bowled by a real ball, and the next man up on his feet ──────
// One blow from going, and every ball left alone until something gives: the
// meter or the stumps. Either way the man who walks out next is standing.
await page.evaluate(() => window.__cricket.hurt());
let next = null;
for (let i = 0; i < 24 && !next; i++) {
  await until('BALL_IN_FLIGHT');
  for (let j = 0; j < 30; j++) {
    await advance(400);
    const now = await snap();
    // Paused on its own is a notice in the way, and nothing will bowl past it.
    if (now.phase === 'PAUSED') throw new Error(`Paused between balls: ${await page.locator('#hurt-note').isVisible() ? 'the hurt note' : 'unknown'}`);
    if (now.phase === 'READY') { if (now.marathon.gone === 2) next = now; break; }
  }
}
check(next?.marathon.batter === 'TAILENDER', 'the No. 3, one blow from going, goes, and the tailender comes in', JSON.stringify((await snap()).marathon));
check(next?.marathon.health === 100, 'with a full meter of his own', `${next?.marathon.health}`);
const standing = await page.evaluate(() => window.__cricket.batter());
check(standing.felled === false, 'standing at his guard, not lying where the last man fell', `${standing.felled}`);
check((await label())?.includes('TAILENDER IN'), 'and named as he walks out', await label());

// ── Declaring: from the twentieth over and not a ball before ───────────────
const balls = (await snap()).balls;
await write(ones(119 - balls));
check((await snap()).balls === 119, 'nineteen overs and five balls bowled', `${(await snap()).balls}`);
await pause();
check(!(await declareShown()), 'no declaration on the pause card a ball short of twenty overs');
await resume();
let state2 = await write([1]);
check(state2.canDeclare, 'twenty overs done, and the innings can be declared', JSON.stringify(state2));
check(state2.level === 3, 'with the express bowler\'s level begun', JSON.stringify(state2));
await pause();
check(await declareShown(), 'and the key is on the pause card');
await resume();
await block();

// ── Declared ───────────────────────────────────────────────────────────────
await pause();
await page.locator('#declare').click({ force: true });
await advance(600);
await page.waitForTimeout(300);
const declared = await snap();
check(declared.phase === 'INNINGS_END' && declared.marathon.ending === 'DECLARED', 'declaring ends the innings', JSON.stringify(declared.marathon));
check(await page.locator('#end').isVisible(), 'on the card');
check((await page.locator('#end-title').textContent())?.includes('Declared'), 'which says it was declared', await page.locator('#end-title').textContent());
const line = await page.locator('#end-message').textContent();
check(['OPENER 39 (', 'NO. 3', 'TAILENDER'].every(word => line.includes(word)), 'with all three batters under the total', line);
check(!(await page.locator('#card-board').isVisible()) && !(await page.locator('#challenge-set').isVisible()),
  'and no board to register on or friend to challenge');

// ── All out, played to the end ─────────────────────────────────────────────
await page.locator('#again').click({ force: true });
await advance(600);
await until('READY');
const again = await snap();
check(again.balls === 0 && again.marathon.batter === 'OPENER', 'playing again starts a new Marathon with the opener', JSON.stringify(again.marathon));
await write([6, 'W', 2, 'H', 1, 'W']);
await advance(600);
const allOut = await snap();
check(allOut.phase === 'INNINGS_END' && allOut.marathon.ending === 'ALL_OUT', 'the third wicket ends it all out', JSON.stringify(allOut.marathon));
check(allOut.marathon.batters.join() === '6,2*,1', 'with the man carried off not out', allOut.marathon.batters.join());
check((await page.locator('#end-title').textContent())?.includes('All out'), 'and the card says so');

// ── Walked out on ──────────────────────────────────────────────────────────
await page.locator('#again').click({ force: true });
await advance(600);
await until('READY');
await write(ones(30));
await block();
await page.keyboard.press('r');
await advance(800);
check((await snap()).balls === 0, 'restarting starts again at nought');

await page.waitForTimeout(1500);
check(!kept.length, 'and no innings, finished or not, was sent anywhere that keeps one', kept.join(', '));
check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
