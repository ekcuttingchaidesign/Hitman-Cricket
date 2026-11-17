/**
 * Super Knockout's practice room (`?knockout=1`), in a real browser: the
 * place on the scoreboard in the LAST cell, the red edge in the drop, the
 * player bowled and the room playing on to the cut that takes them, KNOCKED
 * OUT over the card with SCORECARD and PLAY AGAIN; then a room won with a six
 * every ball, WINNER, and PLAY AGAIN walking out into a new room. The innings
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
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i }); if (await anyway.count()) await anyway.first().click();
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 60; i++) { const ph = await page.evaluate(() => window.__cricket?.snapshot().phase); if (ph === 'READY' || ph === 'BOWLER_RUNUP') break; const d = page.locator('#whatsnew-done'); if (await d.isVisible().catch(() => false)) await d.click({ force: true }); await page.waitForTimeout(400); }
}
const errors = [];
const cell = page => page.evaluate(() => ({ hidden: document.getElementById('ko-cell').hidden, place: document.getElementById('ko-place').textContent, line: document.getElementById('ko-line').textContent, last: getComputedStyle(document.querySelector('.bug-last-cell')).display, drop: document.getElementById('viewport').classList.contains('ko-drop'), wkts: document.getElementById('wickets').textContent, overs: document.getElementById('overs').textContent }));
/** Writes balls once the game is between balls: it takes no ball while the bowler is running in. */
async function write(page, balls) {
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(b => window.__cricket.blast(b), balls)) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`never between balls to write ${balls}`);
}
const pin = async (page, t, name) => { await page.evaluate(v => window.__cricket.knockoutAt(v), t); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}-${t}.png` }); };

// 1. Bowled in the first over, in the drop: knocked out at its end.
let page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7');
let seen = await cell(page);
check(!seen.hidden && seen.last === 'none', 'the place stands in the LAST ball\'s cell', JSON.stringify(seen));
check(seen.place === '#1' && seen.line === 'OF 12' && !seen.drop, 'before a ball: #1 of 12', JSON.stringify(seen));
await page.screenshot({ path: out + '/ko-start.png' });
await write(page, [1, 0, 1]);
await page.waitForTimeout(300);
seen = await cell(page);
const room = await page.evaluate(() => window.__cricket.knockout());
check(seen.drop === room.standing.drop && seen.place === `#${room.standing.place}`, 'the chip and the edge follow the room', JSON.stringify({ seen, room: room.standing }));
check(/^OF \d+$/.test(seen.line), 'the cell is the place and how many are left', seen.line);
const bar = await page.evaluate(() => ({ up: !document.getElementById('ko-track').hidden, say: document.getElementById('ko-say').hidden ? null : document.getElementById('ko-say').textContent,
  zone: document.getElementById('ko-track').dataset.zone, pips: document.getElementById('ko-pips').childElementCount }));
check(bar.up && bar.pips === 12, 'the knockout bar is up with every seat on it', JSON.stringify(bar));
check(bar.zone === (seen.drop ? 'drop' : 'safe'), 'your face rides the bar in the right zone', JSON.stringify(bar));
if (seen.drop) check(/^NEED \d+ RUNS? TO BE SAFE$/.test(bar.say ?? ''), 'in the drop the bar says what it takes', bar.say);
await page.screenshot({ path: out + '/ko-drop.png' });
await page.evaluate(() => window.__cricket.knockoutAt(0));
await write(page, ['W']);
await page.waitForTimeout(800);
check(await page.locator('#ko-moment.is-lost').count() === 1, 'bowled: the room plays on to the cut, and KNOCKED OUT goes up');
const gone = await page.evaluate(() => window.__cricket.knockout());
check(gone.you.place > 1 && gone.you.wentAt === 6, 'gone at the end of the first over, with a place', JSON.stringify(gone.you));
for (const t of [0.4, 0.8, 1.4, 2.45, 3.4]) await pin(page, t, 'ko-lost');
check(await page.locator('#ko-again').isVisible(), 'SCORECARD and PLAY AGAIN are up once it lands');
await page.evaluate(() => window.__cricket.knockoutAt(null));
await page.locator('#ko-card').click();
await page.waitForTimeout(500);
check(await page.locator('#ko-moment').count() === 0 && await page.locator('#again').isVisible(), 'SCORECARD leaves the card');
await page.screenshot({ path: out + '/ko-card.png' });
await page.close();

// 2. A six every ball: the last one standing.
page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push(e.message));
await walkOut(page, '/?knockout=1&debug=1&seed=7');
await page.evaluate(() => window.__cricket.knockoutAt(0));
for (let o = 0; o < 8; o++) {
  if ((await page.evaluate(() => window.__cricket.snapshot().phase)) === 'INNINGS_END') break;
  await write(page, [6, 6, 6, 6, 6, 6]);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
check(await page.locator('#ko-moment.is-won').count() === 1, 'the room won: WINNER goes up');
for (const t of [0.5, 0.85, 1.75, 3.0]) await pin(page, t, 'ko-won');
await page.evaluate(() => window.__cricket.knockoutAt(null));
await page.locator('#ko-again').click();
await page.waitForTimeout(1500);
seen = await cell(page);
check(await page.locator('#ko-moment').count() === 0 && (await page.evaluate(() => window.__cricket.knockout())).bowled === 0 && seen.place === '#1',
  'PLAY AGAIN walks out into a new room', JSON.stringify(seen));
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
check(errors.length === 0, 'nothing in the console', errors.join('\n'));
await b.close();
console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0);
