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
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
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
const declareOpen = () => page.locator('#declare').isEnabled();
const declareSays = () => page.locator('#declare-line').textContent();

await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then it is a first visit. */ }
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
  // Gone between the look and the tap is gone: the stories close themselves.
  await done.click({ force: true, timeout: 3000 }).catch(() => {});
  await advance(400);
  await page.waitForTimeout(200);
}
const card = page.locator('#mode-marathon');
check(await card.isVisible(), 'Select Mode has a Test Marathon card off production');
await card.click({ force: true });
await advance(600);
await page.waitForTimeout(300);

// ── The rules, the first time ──────────────────────────────────────────────
// How to hit and then four rules, over the ground, the bowler at his mark
// until the last is put away, and the two that are about something on the
// screen lighting it. The swipes card itself is `shots-check`'s.
const intro = page.locator('#marathon-intro');
for (let i = 0; i < 20 && !(await intro.isVisible()); i++) { await advance(300); await page.waitForTimeout(100); }
check(await intro.isVisible(), 'the first Marathon starts with its rules over the ground');
const cards = [];
for (let i = 0; i < 5; i++) {
  cards.push({ title: await page.locator('#mi-title').textContent(), spot: await page.locator('#mi-spot').isVisible() });
  await advance(2000);
  if (i === 4) check((await snap()).phase === 'READY' && (await snap()).balls === 0, 'and nothing is bowled while they are up', (await snap()).phase);
  await page.locator('#mi-next').click({ force: true });
  await advance(50);
}
check(JSON.stringify(cards.map(c => c.title)) === JSON.stringify(['Swipe to hit', 'Three batters', 'Focus to settle', 'The pitch wears', 'Every innings counts']),
  'five of them: how to hit, then three batters, focus, the pitch wearing, declaring', JSON.stringify(cards.map(c => c.title)));
check(!cards[0].spot && !cards[1].spot && cards[2].spot && !cards[3].spot && cards[4].spot, 'the focus meter and the pause key lit on the cards about them', JSON.stringify(cards));
check(!(await intro.isVisible()) && await page.evaluate(() => localStorage.getItem('hitman-marathon-intro')) === '1', 'put away by the last, and remembered as shown once');
// Twice at most, and the rest of this check is not about them.
await page.evaluate(() => localStorage.setItem('hitman-marathon-intro', 'done'));

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
const overTheWicket = await page.evaluate(() => window.__cricket.bowler());
check(first.marathon?.side === 'over' && !first.marathon?.round && overTheWicket.x > .3,
  'bowled over the wicket, from his left of the stumps', JSON.stringify(overTheWicket));
check(await page.locator('#confidence').evaluate(el => el.classList.contains('is-injury')), 'with the injury meter, not confidence');
check(await page.locator('#scoreboard').isVisible(), 'and the scoreboard, not a target to chase');
check(await page.evaluate(() => window.__cricket.greenTop()), 'on the Test match\'s greener strip');
check(!(await page.locator('#speed-gun').evaluate(el => el.classList.contains('is-on'))), 'no speed up before a ball is bowled');
const meter = async () => `${await page.locator('#settle-label').textContent()} ${await page.locator('#settle-cap').textContent()}`.trim();
check(await page.locator('#settle').isVisible() && await meter() === `FOCUS 0/${SETTLE_BALLS}`, 'and the opener walks out unsettled, beside the injury meter', await meter());
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
check(await meter() === `FOCUS 0/${SETTLE_BALLS}`, 'unsettled, however settled the opener was', await meter());
await block();

// ── Felled or bowled by a real ball, and the next man up on his feet ──────
// One blow from going, and every ball left alone until something gives: the
// meter or the stumps. Either way the man who walks out next is standing.
await page.evaluate(() => window.__cricket.hurt());
let next = null, physio = false;
for (let i = 0; i < 24 && !next; i++) {
  await until('BALL_IN_FLIGHT');
  for (let j = 0; j < 30; j++) {
    await advance(400);
    const now = await snap();
    // Still in after a ball, one blow from going, he is told so: the physio's
    // card, once a device, paused between balls. Whether a ball gets that far
    // is the seed's business; BAT ON carries on, as it does for a player.
    if (now.phase === 'PAUSED' && !physio && await page.locator('#hurt-note').isVisible()) {
      physio = true;
      check((await page.locator('#hurt-note').textContent())?.includes('PHYSIO ON'), 'one blow from going and still in, he is told so between balls', await page.locator('#hurt-note').textContent());
      await page.locator('#hurt-note-done').click({ force: true });
      await advance(50);
      check((await snap()).phase !== 'PAUSED', 'and BAT ON carries on', (await snap()).phase);
      break;
    }
    // Paused on its own otherwise is a notice in the way, and nothing will bowl past it.
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
check(await declareShown() && !(await declareOpen()), 'a ball short of twenty overs the declare key is there but shut');
check((await declareSays()) === 'You can declare after 20 overs', 'saying when it opens', await declareSays());
await resume();
let state2 = await write([1]);
check(state2.canDeclare, 'twenty overs done, and the innings can be declared', JSON.stringify(state2));
check(state2.level === 3, 'with the express bowler\'s level begun', JSON.stringify(state2));
await pause();
check(await declareShown() && await declareOpen(), 'and the key on the pause card opens');
check((await declareSays()) === 'Ends the innings here and keeps your score', 'saying what it does', await declareSays());
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
// The batting card: a row a batter, the total under them; and the worm over
// it, with a red ball where each man was out.
const scored = await page.locator('#mcard-score').evaluate(node => ({
  rows: [...node.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent.replace(/\s+/g, ' ').trim())),
  total: node.querySelector('tfoot tr')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
}));
check(scored.rows.length === 3 && scored.rows[0][0].startsWith('Opener') && scored.rows[0][1] === '39' && scored.rows[2][0].startsWith('Tailender'),
  'with all three batters on the batting card, runs, balls, fours, sixes and strike rate', JSON.stringify(scored));
check(scored.total.startsWith('Total'), 'and the total under them', scored.total);
const worm = await page.locator('#mcard-worm').evaluate(node => ({ line: !!node.querySelector('.worm-line'), falls: node.querySelectorAll('.worm-fall').length }));
check(worm.line && worm.falls === declared.marathon.gone, 'the worm over it, a ball on the line for each man gone', JSON.stringify(worm));
check((await page.locator('#mcard-modes').isVisible()) && (await page.locator('#mcard-share').isVisible()), 'and CHANGE MODE and SHARE side by side under PLAY AGAIN');
// The boards are asked again at the end of an innings this long, and the
// strip goes up when they answer: a declared innings is a place on a board
// with room on it.
for (let i = 0; i < 20 && !(await page.locator('#claim').isVisible()); i++) { await advance(250); await page.waitForTimeout(150); }
check(await page.locator('#claim').isVisible(), 'and the boards\' strip offers it a place', await page.locator('#claim').textContent());
check(!(await page.locator('#challenge-set').isVisible()), 'but no friend to challenge, which it does not have');
check(!(await page.locator('#card-change').isVisible()), 'and Change mode once, beside SHARE, not again in the Blast\'s pair');
// The Marathon counts a career now: the card carries the widget into My Stats,
// on the Test Marathon's own card, as the other two modes' cards do.
for (let i = 0; i < 20 && !(await page.locator('#card-career').isVisible()); i++) { await advance(250); await page.waitForTimeout(150); }
check(await page.locator('#card-career').isVisible(), 'and the career it adds to');

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
check(await meter() === `FOCUS ${SETTLE_BALLS - 1}/${SETTLE_BALLS}`, 'a ball short, nearly settled', await meter());
await write([1]);
check((await label())?.includes('OPENER SETTLED'), 'thirty, and the call says he is settled', await label());
check(await meter() === 'CONFIDENCE' && (await snap()).marathon.confidence === 25, 'and the meter is his confidence now, a quarter full', await meter());
await block();
await page.keyboard.press('r');
await advance(800);
check((await snap()).balls === 0, 'restarting starts again at nought');

// ── The left-hander, and round the wicket ──────────────────────────────────
// Put at No. 3 by the link, so the man before him and the man after him show
// the mirror coming on and going off again. Every over round the wicket too,
// which is otherwise drawn from the sixth: the bowler from the far side of the
// stumps to the right-handed opener, and the same bowler mirrored with the
// ground to the left-hander. Only the angle the ball is drawn from changes, so
// nothing else here has to know. By the nets' link, which is round the wicket
// from the first ball and has keys to change the bowler.
await page.goto(`${base}/?debug=1&mode=marathon&seed=4242&lefty=2&nets=1`, { waitUntil: 'load' });
await advance(2500);
await page.locator('#start').click({ force: true });
await advance(400);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  // Gone between the look and the tap is gone: the stories close themselves.
  await done.click({ force: true, timeout: 3000 }).catch(() => {});
  await advance(400);
}
await until('READY');
await page.keyboard.press('r');
await advance(16);
const sides = async () => [await page.locator('#side-left').textContent(), await page.locator('#side-right').textContent()].join(' / ');
let hand = (await snap()).marathon;
check(!hand.left && !hand.mirrored && hand.lefty === -1, 'the opener bats right-handed when the left-hander is No. 3', JSON.stringify(hand));
// From here to the end of the section the clock moves only when the check
// moves it. Left running, it runs on in real time behind every screenshot,
// and the first frame a ball is out of the hand is long gone by the time the
// check asks where it is.
const freeze = async () => {
  for (let tries = 0; ; tries++) {
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 250); return; } catch (error) { if (tries > 8) throw error; }
  }
};
await freeze();
/** Half a second into the next run-up, and where the bowler is. */
const runningIn = async () => {
  for (let i = 0; i < 200 && (await snap()).phase !== 'BOWLER_RUNUP'; i++) await advance(20);
  await advance(500);
  return page.evaluate(() => window.__cricket.bowler());
};
const drawn = progress => page.evaluate(p => window.__cricket.drawn(p), progress);
const round = await runningIn();
check(hand.round && round.side === 'round' && round.x < -.3, `round the wicket, the bowler runs in on the far side of the stumps (${round.x.toFixed(2)})`, JSON.stringify(round));
check(round.releaseX < -.5, `and lets the ball go out wide of them (${round.releaseX.toFixed(2)})`, JSON.stringify(round));
const [from, to, line] = [await drawn(0), await drawn(1), Number((await snap()).finalX)];
check(Math.abs(from[0] - round.releaseX) < .01, 'the ball drawn from his hand out there', JSON.stringify({ from, hand: round.releaseX }));
check(Math.abs(to[0] - line) < .001, 'and angling in to reach the bat on its line, where it would have from over the wicket', JSON.stringify({ to, line }));
await page.screenshot({ path: 'test-results/marathon-round-runup.png' });
let leaving = null;
for (let i = 0; i < 40 && !leaving; i++) { await advance(16); leaving = await page.evaluate(() => window.__cricket.field().ball); }
check(!!leaving && Math.abs(leaving[0] - round.releaseX) < .15, 'and on the screen, the first frame it is out of his hand', JSON.stringify({ leaving, hand: round.releaseX }));
const angling = await snap();
await advance(angling.contactAt - angling.elapsed - 40);
await page.keyboard.press('s');
for (let i = 0; i < 30 && (await snap()).phase !== 'READY'; i++) await advance(400);
// The nets: a key a bowler, and one for the side, each from the next ball.
const netsKey = name => page.locator(`.nets-key:text-is("${name}")`);
check(await netsKey('PACE').getAttribute('aria-pressed') === 'true' && await netsKey('ROUND').isVisible(),
  'the nets\' keys are up, the seamer lit, round the wicket', await page.locator('.nets-keys').textContent());
/** A ball blocked, back between balls. */
const through = async () => {
  const ball = await until('BALL_IN_FLIGHT');
  await advance(ball.contactAt - ball.elapsed - 40);
  await page.keyboard.press('s');
  for (let i = 0; i < 30 && (await snap()).phase !== 'READY'; i++) await advance(400);
};
await netsKey('SLING').click({ force: true });
let netted = await runningIn();
let nets = (await snap()).marathon;
check(await netsKey('SLING').getAttribute('aria-pressed') === 'true' && nets.express && nets.action === 'express' && netted.side === 'round' && netted.x < -.3,
  'SLING puts the express bowler on from the next ball, round the wicket', JSON.stringify({ nets, netted }));
await through();
await netsKey('ROUND').click({ force: true });
netted = await runningIn();
check(await netsKey('OVER').isVisible() && netted.side === 'over' && netted.x > .3, 'and the side key takes him back over the wicket', JSON.stringify(netted));
await through();
await netsKey('SPIN').click({ force: true });
await netsKey('OVER').click({ force: true });
netted = await runningIn();
nets = (await snap()).marathon;
check(nets.bowler === 'SPIN' && netted.side === 'round' && netted.x < -.3, 'SPIN, and round again, the spinner from the far side', JSON.stringify({ nets, netted }));
await through();
await netsKey('PACE').click({ force: true });
hand = await write(['W']);
check(hand.left && hand.mirrored, 'the No. 3 walks out left-handed, with the ground mirrored', JSON.stringify(hand));
check((await label())?.includes('NO. 3 IN · TAKE YOUR GUARD'), 'and walks out like anybody else', await label());
check(!(await page.locator('#coach').isVisible()), 'with no panel or arrow to say he is left-handed: it shows');
check(await sides() === 'OFF SIDE / LEG SIDE', 'and the sides along the foot of the field the other way round', await sides());
const mirroredRound = await runningIn();
const mirroredFrom = await drawn(0);
check(mirroredRound.side === 'round' && mirroredRound.x > .3 && mirroredRound.releaseX > .5 && Math.abs(mirroredFrom[0] - mirroredRound.releaseX) < .01,
  'and to the left-hander the same bowler round the wicket, mirrored with the ground, the ball from his hand', JSON.stringify({ ...mirroredRound, from: mirroredFrom }));
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
// Batted in the nets, so practice: a score worth a place, and no place offered.
await write([...Array(60).fill(4), 'W']);
for (let i = 0; i < 20 && !(await page.locator('#claim').isVisible()); i++) { await advance(250); await page.waitForTimeout(150); }
const practiceHead = await page.locator('#card-board-head').textContent();
check(practiceHead?.includes('Practice innings') && (await page.locator('#claim').textContent())?.trim() === 'VIEW LEADERBOARD',
  'an innings from the nets is practice: the card offers no place, only the board', `${practiceHead} / ${await page.locator('#claim').textContent()}`);

await page.clock.resume();

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
  // Gone between the look and the tap is gone: the stories close themselves.
  await done.click({ force: true, timeout: 3000 }).catch(() => {});
  await advance(400);
}
await until('READY');
await page.keyboard.press('r');
await advance(16);
// Held from here, as the left-hander's section is: the sky is measured off a
// screenshot, which in software is slow enough for the clock to bowl the next
// ball behind it, and an over can only be written between balls.
await freeze();
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
check(await page.evaluate(() => window.__cricket.worn()) === 1, 'and the strip worn a stage with it', String(await page.evaluate(() => window.__cricket.worn())));
await block();

// On to the express bowler's first over, the eleventh: his own action, and no
// banner — the playtest took his off, since he announces himself.
told = (await snap()).marathon;
while ((await snap()).balls < 60) {
  const balls = (await snap()).balls;
  told = await write(ones(Math.min(6 - balls % 6, 60 - balls)));
}
const expressOver = (await snap()).balls / 6 + 1;
check(told.bowler === 'EXPRESS' && expressOver === 11, `the express bowler takes the ball at over ${expressOver} (always the eleventh)`, JSON.stringify(told));
check((await banner()) === null && !('express' in told.told), 'and nothing is put up to say so', `${await banner()} ${JSON.stringify(told.told)}`);
check(await page.evaluate(() => window.__cricket.worn()) === 2, 'but the strip wears another stage as he comes on', String(await page.evaluate(() => window.__cricket.worn())));
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
