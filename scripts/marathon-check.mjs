/**
 * Test Marathon, in a real browser, reached the way a player reaches it.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/marathon-check.mjs                  # that dev server
 *   node scripts/marathon-check.mjs http://…:4173    # a preview build
 *
 * What no unit test can see: the card on Select Mode that starts it, the batter named on the screen as he walks out,
 * the next one standing at his guard with a full meter after the last was
 * carried off, the declare key on the pause card from the twentieth over and
 * not a ball before, the card at the end with all three batters on it and the
 * boards' strip offering it a place — and nothing sent without being asked.
 * The Marathon has boards but no career yet, so an innings of it, finished or
 * walked out on, must reach no career, and reaches a board only when the
 * player claims the place (`scripts/board-check.mjs` and the unit tests hold
 * what a claim writes).
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
// Nobody here claims a place, so nothing at all should go.
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
const SETTLE_BALLS = 30;

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
/** How colourful a patch of a screenshot is: mean HSV saturation, 0 to 1. As `milestone-check.mjs` measures it. */
const saturation = (png, box) => page.evaluate(async ({ data, box }) => {
  const image = new Image(); image.src = data; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = box.w; canvas.height = box.h;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, box.x * 2, box.y * 2, box.w * 2, box.h * 2, 0, 0, box.w, box.h);
  const { data: px } = ctx.getImageData(0, 0, box.w, box.h);
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2]);
    total += max ? (max - min) / max : 0;
  }
  return total / (px.length / 4);
}, { data: `data:image/png;base64,${png.toString('base64')}`, box });
const pause = async () => { await page.locator('#pause').click({ force: true }); await advance(50); };
const resume = async () => { await page.locator('#resume').click({ force: true }); await advance(50); };
const declareShown = () => page.locator('#declare').isVisible();

await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then it is a first visit. */ }
  try { localStorage.setItem('hitman-unveiled', 'ground-stadium'); } catch { /* Then they stand in the way. */ }
});

await page.clock.install();
// All three right-handed here; the left-hander has a section of his own below.
// In by the picker, as a player off production comes in: the two later visits
// use the `?mode=marathon` link, so both ways in are walked.
await page.goto(`${base}/?debug=1&seed=4242&lefty=0`, { waitUntil: 'load' });
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
const card = page.locator('#mode-marathon');
check(await card.isVisible(), 'Select Mode has a Test Marathon card off production');
await card.click({ force: true });
await advance(600);
await page.waitForTimeout(300);

// From here the clock moves only when the check moves it. Left running, a
// software-rendered frame is most of a second of real time, and a guard of
// 420ms is gone before the next line of this script runs — so a ball is
// already on its way when the innings is written past it. Five seconds ahead,
// not one: a server still compiling on its first visit can take longer than a
// second between reading the clock and stopping it, and a stop in the past
// throws.
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 5000);

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
check(await page.evaluate(() => window.__cricket.greenTop()), 'on the Test match\'s greener strip');
check(!(await page.locator('#speed-gun').evaluate(el => el.classList.contains('is-on'))), 'no speed up before a ball is bowled');
const meter = async () => `${await page.locator('#settle-label').textContent()} ${await page.locator('#settle-cap').textContent()}`.trim();
check(await page.locator('#settle').isVisible() && await meter() === `SETTLING 0/${SETTLE_BALLS}`, 'and the opener walks out unsettled, beside the injury meter', await meter());
check(!(await page.locator('#scoreboard').textContent())?.includes('KM/H'), 'and none on the scoreboard');
await block();
check(!(await label())?.includes('OPENER IN'), 'said once, and not again the next ball', await label());
const gun = Number(await page.locator('#speed').textContent());
check(await page.locator('#speed-gun').evaluate(el => el.classList.contains('is-on')) && gun >= 70 && gun <= 160,
  'the speed gun put the ball up at the foot of the field, between 70 and 160', `${gun}`);

// ── A wicket brings the No. 3 ──────────────────────────────────────────────
let state = await write([...ones(39), 'W']);
check(state.batter === 'NO_3' && state.gone === 1, 'a wicket sends the No. 3 in', JSON.stringify(state));
check(state.batters[0] === '39', 'with the opener out for what he made', JSON.stringify(state.batters));
check((await label())?.includes('NO. 3 IN'), 'named as he walks out', await label());
check(await meter() === `SETTLING 0/${SETTLE_BALLS}`, 'unsettled, however settled the opener was', await meter());
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
// The boards are asked again at the end of an innings this long, and the
// strip goes up when they answer: a declared innings is a place on a board
// with room on it.
for (let i = 0; i < 20 && !(await page.locator('#claim').isVisible()); i++) { await advance(250); await page.waitForTimeout(150); }
check(await page.locator('#claim').isVisible(), 'and the boards\' strip offers it a place', await page.locator('#claim').textContent());
check(!(await page.locator('#challenge-set').isVisible()) && !(await page.locator('#card-career').isVisible()),
  'but no friend to challenge and no career, which it does not have yet');

// ── All out, played to the end ─────────────────────────────────────────────
await page.locator('#again').click({ force: true });
// Less than the guard: any longer and a ball is bowled at nobody.
await advance(16);
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
// Less than the guard: any longer and a ball is bowled at nobody.
await advance(16);
await until('READY');
await write(ones(SETTLE_BALLS - 1));
check(await meter() === `SETTLING ${SETTLE_BALLS - 1}/${SETTLE_BALLS}`, 'a ball short, nearly settled', await meter());
await write([1]);
check((await label())?.includes('OPENER SETTLED'), 'thirty, and the call says he is settled', await label());
check(await meter() === 'CONFIDENCE' && (await snap()).marathon.confidence === 25, 'and the meter is his confidence now, a quarter full', await meter());
await block();
await page.keyboard.press('r');
await advance(800);
check((await snap()).balls === 0, 'restarting starts again at nought');

// ── The left-hander ────────────────────────────────────────────────────────
// Put at No. 3 by the link, so the man before him and the man after him show
// the mirror coming on and going off again.
await page.goto(`${base}/?debug=1&mode=marathon&seed=4242&lefty=2`, { waitUntil: 'load' });
await advance(2500);
await page.locator('#start').click({ force: true });
await advance(400);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await advance(400);
}
await until('READY');
await page.keyboard.press('r');
await advance(16);
const sides = async () => [await page.locator('#side-left').textContent(), await page.locator('#side-right').textContent()].join(' / ');
let hand = (await snap()).marathon;
check(!hand.left && !hand.mirrored && hand.lefty === -1, 'the opener bats right-handed when the left-hander is No. 3', JSON.stringify(hand));
hand = await write(['W']);
check(hand.left && hand.mirrored, 'the No. 3 walks out left-handed, with the ground mirrored', JSON.stringify(hand));
check((await label())?.includes('NO. 3 IN · TAKE YOUR GUARD'), 'and walks out like anybody else', await label());
check(!(await page.locator('#coach').isVisible()), 'with no panel or arrow to say he is left-handed: it shows');
check(await sides() === 'OFF SIDE / LEG SIDE', 'and the sides along the foot of the field the other way round', await sides());
const lefty = await until('BALL_IN_FLIGHT');
await advance(lefty.contactAt - lefty.elapsed - 40);
await page.keyboard.press('d');
await advance(150);
check((await snap()).shot === 'LEG', 'the key on the right plays to his leg side', (await snap()).shot);
let after = await snap();
for (let i = 0; i < 30 && after.phase !== 'READY'; i++) { await advance(400); after = await snap(); }
if (after.marathon.gone < 2) after = { marathon: await write(['W']) };
hand = after.marathon;
check(hand.batter === 'TAILENDER' && !hand.left && !hand.mirrored, 'the tailender after him is right-handed, and the mirror is off', JSON.stringify(hand));
check(await sides() === 'LEG SIDE / OFF SIDE', 'with the sides back where they were', await sides());

// ── The levels, told: the swing under cloud, and the express bowler ───────
// Written forward an over at a time, so each lands at the top of an over the
// way a real one does, and the banner is read where a player would read it.
await page.goto(`${base}/?debug=1&mode=marathon&seed=4242&lefty=0`, { waitUntil: 'load' });
await advance(2500);
await page.locator('#start').click({ force: true });
await advance(400);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await advance(400);
}
await until('READY');
await page.keyboard.press('r');
await advance(16);
const banner = async () => (await page.locator('#level-banner').isVisible())
  ? [await page.locator('#lb-eyebrow').textContent(), await page.locator('#lb-title').textContent()].join(' / ') : null;
const { width: W, height: H } = page.viewportSize();
// The strip of sky between the score bar and the stand roof, clear of the
// floodlight on the left and the debug panel on the right.
const skyBox = { x: Math.round(W * .1), y: Math.round(H * .098), w: Math.round(W * .3), h: Math.round(H * .014) };
const clearSky = await saturation(await page.screenshot(), skyBox);
check((await snap()).marathon.clouded === 0 && !(await banner()), 'a Marathon starts under a clear sky, with nothing to tell');

let told = (await snap()).marathon;
while (!told.told.swing && (await snap()).balls < 120) told = await write(ones(6));
const swingOver = (await snap()).balls / 6 + 1;
check(told.told.swing && swingOver >= 6, `the swing is told at the top of over ${swingOver}, the sixth or later`, JSON.stringify(told));
check((await banner()) === `OVER ${swingOver} · CLOUD COVER / THE BALL HAS STARTED TO SWING`, 'on a banner across the field', await banner());
await advance(1500);
check((await snap()).phase === 'READY', 'and the bowler waits at his mark while it is up', (await snap()).phase);
await advance(2200);
const clouded = await snap();
check(clouded.marathon.clouded === 1, 'the cloud has come over by the time it is down', `${clouded.marathon.clouded}`);
await page.screenshot({ path: 'test-results/marathon-overcast.png' });
const greySky = await saturation(await page.screenshot(), skyBox);
check(greySky < clearSky * .85, `and the sky is greyer for it (saturation ${clearSky.toFixed(2)} to ${greySky.toFixed(2)})`);
await block();

// On to the express bowler's first over: the banner, and his own action.
told = (await snap()).marathon;
while (!told.told.express && (await snap()).balls < 300) {
  const balls = (await snap()).balls;
  told = await write(ones(6 - balls % 6));
}
const expressOver = (await snap()).balls / 6 + 1;
check(told.told.express && told.bowler === 'EXPRESS', `the express bowler is told as he takes the ball, at over ${expressOver}`, JSON.stringify(told));
check((await banner()) === `OVER ${expressOver} · NEW BOWLER / EXPRESS PACE`, 'on a banner of his own', await banner());
const quick = await until('BOWLER_RUNUP');
check(quick.marathon.action === 'express' && quick.marathon.express, 'running in with the express action', JSON.stringify(quick.marathon));
await page.screenshot({ path: 'test-results/marathon-express-runup.png' });
await block();
const rest = (await snap()).balls;
await write(ones(6 - rest % 6));
const following = await until('BOWLER_RUNUP');
check(following.marathon.bowler !== 'EXPRESS' && following.marathon.action === 'pace', 'and the over after his, the fast bowler\'s action again', JSON.stringify(following.marathon));
await block();

await page.waitForTimeout(1500);
check(!kept.length, 'and no innings, finished or not, was sent anywhere that keeps one without being claimed', kept.join(', '));
check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
