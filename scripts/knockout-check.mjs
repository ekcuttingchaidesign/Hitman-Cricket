/**
 * Super Knockout's practice room (`?knockout=1`), in a real browser: the
 * shorter scoreboard (the over of five and this over ball by ball, no LAST
 * cell), the knockout bar with the place, every seat and the face, its mood
 * and the fire in the drop, the red edge, the player bowled and the room playing on to the cut that takes them, KNOCKED
 * OUT over the card with SCORECARD and PLAY AGAIN; then a room won with a six
 * every ball, the free hit it earns and a wicket on it not counting, WINNER,
 * and PLAY AGAIN walking out into a new room; the scoreboard held between
 * balls, the bowler waiting, a touch with the ball live doing nothing, and
 * the ground's screen with the line and the cut; the bar's moods; and the way
 * in from Choose a mode. The innings
 * are written through `__cricket.blast`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/knockout-check.mjs [base] [shots-dir]
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, ''), out = process.argv[3] ?? 'test-results/knockout';
await mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;
const check = (ok, what, detail) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`); if (!ok) failures++; };
async function walkOut(page, link) {
  await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9,cams:9'); localStorage.setItem('hitman-keeper-intro','done'); } catch {} });
  await page.goto(base + link, { waitUntil: 'load' });
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i }); if (await anyway.count()) await anyway.first().click();
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 60; i++) { const ph = await page.evaluate(() => window.__cricket?.snapshot().phase); if (ph === 'READY' || ph === 'BOWLER_RUNUP') break; const d = page.locator('#whatsnew-done'); if (await d.isVisible().catch(() => false)) await d.click({ force: true }); await page.waitForTimeout(400); }
}
const errors = [];
const cell = page => page.evaluate(() => ({ hidden: getComputedStyle(document.getElementById('ko-cell')).display === 'none', place: document.getElementById('ko-at').textContent, line: document.getElementById('ko-of').textContent, last: getComputedStyle(document.querySelector('.bug-last-cell')).display, drop: document.getElementById('viewport').classList.contains('ko-drop'), wkts: getComputedStyle(document.getElementById('wickets')).display, overs: document.getElementById('overs').textContent, label: document.getElementById('overs-label').textContent, balls: [...document.querySelectorAll('#ko-over i')].map(i => i.textContent).join(',') }));
/** Whether the fire's canvas has anything painted on it. */
const burning = page => page.evaluate(() => { const c = document.querySelector('.ko-fx'); if (!c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) return true; return false; });
/** Writes balls once the game is between balls: it takes no ball while the bowler is running in. */
async function write(page, balls) {
  for (let i = 0; i < 400; i++) {
    if (await page.evaluate(b => window.__cricket.blast(b), balls)) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`never between balls to write ${balls}`);
}
/** A screenshot that never stops the check: in software rendering a screen over the live ground can take a long time to settle. */
const snap = (page, path) => page.screenshot({ path, animations: 'disabled', timeout: 20000 }).catch(e => console.log(`  (no picture of ${path}: ${e.message.split('\n')[0]})`));
const pin = async (page, t, name) => { await page.evaluate(v => window.__cricket.knockoutAt(v), t); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}-${t}.png` }); };

// 1. Bowled in the first over, in the drop: knocked out at its end.
let page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7');
let seen = await cell(page);
check(seen.hidden && seen.last === 'none' && seen.wkts === 'none', 'the scoreboard is the shorter one: no LAST cell, no place cell, no wickets', JSON.stringify(seen));
check(seen.label === 'OVERS', 'the pill says OVERS under the overs (FINAL in the final)', seen.label);
check(seen.place === '#1' && seen.line === 'OF 12' && !seen.drop, 'before a ball the bar says #1 of 12', JSON.stringify(seen));
await page.screenshot({ path: out + '/ko-start.png' });
await write(page, [1, 0, 1]);
await page.waitForTimeout(300);
seen = await cell(page);
const room = await page.evaluate(() => window.__cricket.knockout());
check(seen.drop === room.standing.drop && seen.place === `#${room.standing.place}`, 'the chip and the edge follow the room', JSON.stringify({ seen, room: room.standing }));
check(/^OF \d+$/.test(seen.line), 'the bar says the place and how many are left', seen.line);
check(seen.balls.split(',').filter(Boolean).slice(-3).join(',') === '1,·,1', 'this over, ball by ball', seen.balls);
const bar = await page.evaluate(() => ({ up: !document.getElementById('ko-track').hidden, say: document.getElementById('ko-say').hidden ? null : document.getElementById('ko-say').textContent,
  mood: document.getElementById('ko-track').dataset.mood, seats: document.querySelectorAll('#ko-track .ko-seat').length, brow: document.getElementById('ko-brow').textContent,
  red: document.querySelectorAll('#ko-track .ko-seat[data-zone="drop"]').length }));
check(bar.up && bar.seats === 12 && /^BOTTOM 2 KNOCKED OUT (IN [2-6] BALLS|AFTER THIS BALL)$/.test(bar.brow), 'the knockout bar is up with every seat on it, and says who goes and when', JSON.stringify(bar));
check((bar.mood === 'drop') === seen.drop && bar.red === 2, 'the bar\'s mood follows the room, two seats in the drop', JSON.stringify(bar));
if (seen.drop) {
  check(/^NEED \d+ RUNS? TO BE SAFE$/.test(bar.say ?? ''), 'in the drop the bar says what it takes', bar.say);
  check(await burning(page), 'in the drop the red seats are on fire');
}
await page.screenshot({ path: out + '/ko-drop.png' });
await page.evaluate(() => window.__cricket.knockoutAt(0));
await write(page, ['W']);
await page.waitForTimeout(800);
check(await page.locator('#ko-moment.is-lost').count() === 1, 'bowled: the room plays on to the cut, and KNOCKED OUT goes up');
const gone = await page.evaluate(() => window.__cricket.knockout());
check(gone.you.place > 1 && gone.you.wentAt === 6, 'gone at the end of the first over, with a place', JSON.stringify(gone.you));
// The glass break (section 37): cracks from the stumps with the colour draining after them, the scoreboard in pieces.
const glassAt = async t => { await page.evaluate(v => window.__cricket.knockoutAt(v), t); await page.waitForTimeout(400);
  return page.evaluate(() => ({ drain: document.querySelector('.ko-drain')?.style.clipPath ?? null, bugs: document.querySelectorAll('.score-bug').length,
    falling: [...document.querySelectorAll('.score-bug')].filter(el => el.style.visibility === 'visible' && el.style.transform).length,
    hidden: document.querySelector('.score-bug')?.style.visibility === 'hidden' })); };
const cracking = await glassAt(0.35);
check(/^circle\(/.test(cracking.drain ?? '') && cracking.bugs > 5 && !cracking.hidden, 'the glass cracks and the colour drains after it, the scoreboard still whole', JSON.stringify(cracking));
const shattered = await glassAt(0.75);
check(shattered.hidden && shattered.falling > 5 && shattered.drain === 'none', 'the scoreboard breaks into pieces that fall', JSON.stringify(shattered));
for (const t of [0.06, 0.35, 0.75, 1.42, 2.05, 2.5, 2.9, 3.5]) await pin(page, t, 'ko-lost');
check(await page.locator('#ko-again').isVisible(), 'SCORECARD and PLAY AGAIN are up once it lands');
await page.evaluate(() => window.__cricket.knockoutAt(null));
await page.locator('#ko-card').click();
await page.waitForTimeout(500);
check(await page.locator('#ko-moment').count() === 0 && await page.locator('#again').isVisible(), 'SCORECARD leaves the card');
check(await page.evaluate(() => document.querySelectorAll('.score-bug').length === 1 && document.querySelector('.score-bug').style.visibility === ''), 'the scoreboard is whole again under the card');
await page.screenshot({ path: out + '/ko-card.png' });
await page.close();

// 2. A six every ball: the last one standing.
page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7');
await page.evaluate(() => window.__cricket.knockoutAt(0));
// The over's top three bat the next ball as a free hit: FH in its slot, gold, and a wicket on it does not count.
// Each write is read in the same turn, and the W goes in at once: the live game bowls on behind them, and a ball left alone can be the free hit.
const writeRead = async balls => {
  for (let i = 0; i < 400; i++) {
    const seen = await page.evaluate(b => window.__cricket.blast(b) ? { ...window.__cricket.knockout(),
      fh: [...document.querySelectorAll('#ko-over i')].map(i => `${i.textContent}${i.className ? `[${i.className}]` : ''}`).join(',') } : null, balls);
    if (seen) return seen;
    await page.waitForTimeout(150);
  }
  throw new Error(`never between balls to write ${balls}`);
};
const given = await writeRead([6, 6, 6, 6, 6, 6]);
const told = await page.evaluate(() => ({ toast: !!document.getElementById('ko-fh-toast'), edge: document.getElementById('viewport').classList.contains('ko-fh-next') }));
check(given.freeAhead && !given.freeNext && !told.toast && !told.edge && given.bowled === 6, 'top of the first over: a free hit earned, and nothing put up for it until its ball', JSON.stringify({ given, told }));
await snap(page, out + '/ko-free-hit-earned.png');
// Ones up to the over's free hit ball (never its first), then out on it: all in one turn, before the bowler can run in.
const run = await (async () => {
  for (let i = 0; i < 400; i++) {
    const seen = await page.evaluate(() => {
      const k = window.__cricket.knockout, view = document.getElementById('viewport');
      const slots = () => [...document.querySelectorAll('#ko-over i')].map(i => `${i.textContent}${i.className ? `[${i.className}]` : ''}`).join(',');
      if (window.__cricket.snapshot().phase !== 'READY') return null;
      for (let n = 0; n < 6 && !k().freeNext; n++) if (!window.__cricket.blast([1])) return null;
      const upTo = { ...k(), edge: view.classList.contains('ko-fh-next') && !!view.querySelector('.ko-fh-edge'), label: document.getElementById('phase-label')?.textContent, slots: slots() };
      if (!window.__cricket.blast(['W'])) return null;
      return { upTo, after: { ...k(), edge: view.classList.contains('ko-fh-next'), fh: slots() } };
    });
    if (seen) return seen;
    await page.waitForTimeout(150);
  }
  throw new Error('never between balls for the free hit');
})();
const { upTo, after } = run;
let fh = after.fh;
check(upTo.freeNext && upTo.freeBall && upTo.freeBall.ball >= 1 && upTo.bowled % 6 === upTo.freeBall.ball && upTo.edge && /FH\[is-free is-next\]/.test(upTo.slots) && upTo.label === 'FREE HIT',
  `the free hit ball comes later in the over (ball ${(upTo.freeBall?.ball ?? -1) + 1}, a ${upTo.freeBall?.name}), the cyan edge round the screen, FREE HIT on the guard line and FH in its slot`, JSON.stringify(upTo));
check(!after.you.out && after.bowled === upTo.bowled + 1 && /is-free/.test(fh) && !after.edge, 'bowled on the free hit: not out, the slot kept gold, the edge let go', JSON.stringify({ fh, you: after.you }));
await snap(page, out + '/ko-free-hit.png');

// The rest of the room in one write, so no live ball falls between two (the writer stops once the room is done with the player).
await write(page, Array(30).fill(6));
await page.waitForTimeout(800);
check(await page.locator('#ko-moment.is-won').count() === 1, 'the room won: WINNER goes up');
for (const t of [0.5, 0.85, 1.75, 3.0]) await pin(page, t, 'ko-won');
await page.evaluate(() => window.__cricket.knockoutAt(null));
await page.locator('#ko-again').click();
await page.waitForTimeout(1500);
seen = await cell(page);
check(await page.locator('#ko-moment').count() === 0 && (await page.evaluate(() => window.__cricket.knockout())).bowled === 0 && seen.place === '#1',
  'PLAY AGAIN walks out into a new room', JSON.stringify(seen));
await page.close();
// 2b. Hold the scoreboard (P8, H1 to H3), and the ground's screen (P5, P6).
page = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=29');
await write(page, [6, 0, 0, 1, 0]);
const bug = await page.locator('.score-bug').boundingBox();
await page.mouse.move(bug.x + 40, bug.y + 20); await page.mouse.down();
await page.waitForTimeout(400);
const heldNow = await page.evaluate(() => ({ phase: window.__cricket.snapshot().phase, panel: !document.getElementById('ko-held').hidden,
  rows: document.querySelectorAll('#ko-held .ko-held-row').length, you: document.querySelectorAll('#ko-held .ko-held-row.is-you').length,
  cut: document.querySelectorAll('#ko-held .ko-held-cut').length, ring: !document.getElementById('ko-wait').hasAttribute('hidden'), screen: window.__cricket.arena()?.knockout?.kind }));
check(heldNow.panel && heldNow.rows === 12 && heldNow.you === 1 && heldNow.cut === 1 && heldNow.ring, 'held between balls: everyone, the player outlined, the line dashed, the ring round it', JSON.stringify(heldNow));
check(heldNow.screen === 'line', "between balls the ground's screen shows the line", JSON.stringify(heldNow));
await page.screenshot({ path: out + '/ko-held.png' });
await page.waitForTimeout(1500);
check((await page.evaluate(() => window.__cricket.snapshot().phase)) === 'READY', 'the bowler waits at his mark while it is held');
await page.mouse.up();
await page.waitForTimeout(200);
check(await page.evaluate(() => document.getElementById('ko-held').hidden), 'let go and it is gone');
// The over's last ball: the cut on the screen.
// Written at once, before the bowler runs in, and read two frames on, once the screen has been painted.
const cutNow = await (async () => { for (let i = 0; i < 120; i++) { const seen = await page.evaluate(() => { const k = window.__cricket.knockout(); if (k.you.place !== null) return 'gone';
  return window.__cricket.blast(Array(6 - (k.bowled % 6)).fill(6)) ? new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(window.__cricket.arena()?.knockout)))) : undefined; }); if (seen !== undefined) return seen; await page.waitForTimeout(150); } return null; })();
if (cutNow === 'gone') console.log('  (the player went before the over ended: no cut to read)');
else check(cutNow?.kind === 'cut' && cutNow.out >= 2 && cutNow.names.length === cutNow.out, "at the over's end the screen says who went and how many are left", JSON.stringify(cutNow));
for (let i = 0; i < 400; i++) { if ((await page.evaluate(() => window.__cricket.snapshot().phase)) !== 'READY') break; await page.waitForTimeout(100); }
await page.mouse.down(); await page.waitForTimeout(300);
check(await page.evaluate(() => document.getElementById('ko-held').hidden && window.__cricket.arena()?.knockout === null), 'with the ball live a touch on it does nothing, and the screen has the score');
await page.mouse.up();
await page.close();
// 3. The scoreboard with the meter full: it stays clear of the keys beside it.
page = await b.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7&charge=1');
await write(page, [4, 4]);
await page.waitForTimeout(400);
const fit = await page.evaluate(() => {
  const bug = document.querySelector('.score-bug').getBoundingClientRect(), keys = document.getElementById('pause').getBoundingClientRect();
  return { right: Math.round(bug.right), keys: Math.round(keys.left), full: document.getElementById('confidence').classList.contains('is-full') };
});
check(fit.right <= fit.keys, 'the scoreboard stays clear of the keys with the meter full', JSON.stringify(fit));
await page.screenshot({ path: out + '/ko-full-meter.png' });
await page.close();
// 4. Every mood of the bar, in the Final page's made-up rooms, photographed.
page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7');
for (const mood of ['calm', 'edge', 'level', 'drop', 'final']) {
  await page.evaluate(m => window.__cricket.knockoutMood(m, 2), mood);
  await page.waitForTimeout(1500);
  const got = await page.evaluate(() => ({ mood: document.getElementById('ko-track').dataset.mood, say: document.getElementById('ko-say').hidden ? null : document.getElementById('ko-say').textContent,
    drop: [...document.querySelectorAll('#ko-track .ko-zone')].filter(z => !z.hidden).map(z => z.textContent).join(' ') }));
  check(got.mood === mood, `the bar stands ${mood}`, JSON.stringify(got));
  if (mood === 'final') check(got.drop === 'GONE BEHIND AHEAD' && got.say === 'NEED 7 RUNS TO WIN', 'the final: behind and ahead, and what it takes to win', JSON.stringify(got));
  if (mood === 'drop' || mood === 'final') check(await burning(page), `${mood === 'drop' ? 'the drop is on fire' : 'the fuse is lit'}`);
  await page.screenshot({ path: `${out}/ko-mood-${mood}.png`, clip: { x: 0, y: 560, width: 390, height: 284 } });
}
await page.close();
// 5. The way in (K1, K2, K2b): Choose a mode's rail, the card, the rules the first time, the home and QUICK MATCH.
page = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9,cams:9'); localStorage.setItem('hitman-keeper-intro','done'); } catch {} });
await page.goto(base + '/?debug=1', { waitUntil: 'load' });
await page.addStyleTag({ content: '#debug{display:none!important}' });
await page.waitForTimeout(1500);
{ const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i }); if (await anyway.count()) await anyway.first().click(); }
await page.locator('#start').click({ force: true });
await page.waitForSelector('#modes:not(.hidden)', { timeout: 20000 });
await page.waitForTimeout(600);
const rail = await page.evaluate(() => ({ order: [...document.querySelectorAll('#modes-rail .ms-poster:not(.hidden)')].map(e => e.dataset.mode).join(' '),
  card: !document.getElementById('mode-knockout-card').classList.contains('hidden'), super10Card: !document.getElementById('mode-super10').classList.contains('hidden') }));
check(rail.order === 'SUPER10 CLASSIC MARATHON KNOCKOUT SURVIVE', 'the rail is Super10, the Blast, the Marathon, Super Knockout, Survival', rail.order);
check(rail.card && !rail.super10Card, "Super Knockout's card stands under the rail in Super10's card's place", JSON.stringify(rail));
await snap(page, out + '/k1.png');
await page.locator('#mode-knockout').click();
await page.waitForTimeout(500);
check(await page.locator('#knockout-rules:not(.hidden)').count() === 1 && await page.locator('#knockout-home:not(.hidden)').count() === 1, 'the first time, how it works opens over the home by itself');
await snap(page, out + '/k2b.png');
await page.locator('#ko-rules-back').click();
await page.waitForTimeout(300);
check(await page.locator('#knockout-rules.hidden').count() === 1, 'back from how it works is the home');
await snap(page, out + '/k2.png');
check(await page.locator('#ko-friends[disabled]').count() === 1, 'PLAY WITH FRIENDS waits for real rooms');
await page.locator('#ko-home-back').click();
await page.locator('#mode-knockout').click();
await page.waitForTimeout(300);
check(await page.locator('#knockout-rules.hidden').count() === 1, 'the second time, the home opens on its own');
await page.locator('#ko-quick').click();
for (let i = 0; i < 60; i++) { const ph = await page.evaluate(() => window.__cricket?.snapshot().phase); if (ph === 'READY' || ph === 'BOWLER_RUNUP') break; await page.waitForTimeout(250); }
const inRoom = await page.evaluate(() => ({ room: window.__cricket.knockout()?.left, bar: !document.getElementById('ko-track').hidden, mode: localStorage.getItem('hitman-last-mode') }));
check(inRoom.room === 12 && inRoom.bar && inRoom.mode === 'KNOCKOUT', 'QUICK MATCH walks out into a room of twelve', JSON.stringify(inRoom));
await page.close();
check(errors.length === 0, 'nothing in the console', errors.join('\n'));
await b.close();
console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
