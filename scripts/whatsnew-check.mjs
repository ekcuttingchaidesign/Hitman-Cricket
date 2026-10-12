/**
 * The update's stories, driven in a real browser.
 *
 *   npx vite --port 5199 &
 *   node scripts/whatsnew-check.mjs                    # that dev server
 *   node scripts/whatsnew-check.mjs http://…:4173      # a preview build
 *
 * Every rule this screen has is about *when* it appears — twice unasked, then
 * never; on demand from the board for ever, without spending either of the two
 * — and none of that is a thing a unit test can watch happen. It is also the
 * one screen in the game that stands between a player and the innings they came
 * for, so the way out of it is worth proving rather than assuming.
 *
 * It writes nothing but this browser's own localStorage, in a throwaway
 * profile, so it is safe to point anywhere.
 *
 * Time is driven by hand throughout. A story holds for seven seconds and then
 * moves on by itself, which is the screen working as intended and a race this
 * script cannot win: driven against the wall clock it taps a card that has
 * already moved on, and on a slow enough server it taps past the end and finds
 * the stories closed. So the page's clock is frozen and wound on where the
 * waiting is the point — which also makes the auto-advance itself something
 * that can be checked rather than something to be dodged.
 */

import { chromium } from '@playwright/test';

/** The update key in `src/game/whats-new.ts`. Bumped there, bumped here. */
const UPDATE = 'dressing-room';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.clock.install();

/** The page's own clock, wound on, then a beat of real time to draw in. */
const tick = async (ms, draw = 200) => { await page.clock.runFor(ms); await page.waitForTimeout(draw); };
const title = () => page.$eval('.whatsnew-title', node => node.textContent.trim());
/**
 * Stops the page's clock where it stands. Its time can run past the moment
 * asked for between reading it and pausing at it, so it is read again and
 * asked for again until it holds.
 */
async function freeze() {
  for (let tries = 0; ; tries++) {
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 250); return; } catch (error) { if (tries > 8) throw error; }
  }
}
const seen = () => page.evaluate(() => localStorage.getItem('hitman-whatsnew'));
async function arrive() {
  await tick(3000, 800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await tick(1500, 400); }
}

await page.goto(`${base}/`, { waitUntil: 'load' });
await arrive();

// ── The first visit ────────────────────────────────────────────────────────
// From here the clock moves only when the check moves it, and it is stopped
// before the stories open rather than after. Left running, it runs on in real
// time while a slow machine draws the first story — a photograph and a blur of
// it across the screen — and a card's seven-second hold can be gone before the
// next line runs, so the check reads the second card where the first should be.
await freeze();
await page.click('#start');
let opened = false;
for (let wound = 0; wound < 6000 && !opened; wound += 100) {
  await page.clock.runFor(100);
  opened = !!(await page.$('.whatsnew-sheet'));
}
check(opened, 'the play key stops at the stories the first time');
if (!opened) { await browser.close(); process.exit(1); }

const first = await title();
// A build that plays one mode has no picker to skip to, so the key says the
// other thing. Either is right; a key that promises the picker in a build
// without one is not.
const says = await page.$eval('#whatsnew-done', key => key.textContent.trim());
check(says === 'SKIP TO MODE SELECTION' || says === 'SKIP AND START BATTING',
  'the way out says where it goes', says);
// Waited for from out here, a beat at a time: the page's own timers are the
// ones standing still.
async function loaded() {
  for (let i = 0; i < 40; i++) {
    if (await page.$eval('.whatsnew-art img', img => img.complete && img.naturalWidth > 0).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
// The Dressing Room, in three: the kits, the bats, and the free bat with the way in.
check(first === 'SUIT UP', 'it opens on the kits', first);
check(await loaded(), 'with its picture on the screen, loaded', await page.$eval('.whatsnew-art img', img => img.src));
check(!(await page.$('#whatsnew-open')), 'and no way in on a card that asks for nothing');

// Each holds a while and moves on by itself. Wound in half-second steps until
// it does: the installed clock also runs on by itself in real time, and one
// long wind on a slow machine carries a card past its own hold and the next one's too.
let held = 0;
for (; held < 14000 && await title() === first; held += 500) await tick(500, 150);
check(held >= 5000, 'holding a while', `${held}ms`);
check(await title() === 'EARN YOUR WILLOW', 'and moving on by itself to the bats', await title());
for (held = 0; held < 14000 && await title() === 'EARN YOUR WILLOW'; held += 500) await tick(500, 150);
const last = await title();
check(last === 'BOOM IS ON THE HOUSE', 'and on to the free bat, last', last);
check(await loaded(), 'its picture loaded');
const way = await page.$('#whatsnew-open');
check(!!way && (await way.textContent()).trim() === 'OPEN THE DRESSING ROOM', 'with OPEN THE DRESSING ROOM under it');
const stack = await page.evaluate(() => {
  const top = sel => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
  return [top('.whatsnew-art img'), top('#whatsnew-open'), top('#whatsnew-done')];
});
check(stack[0] < stack[1] && stack[1] < stack[2], 'picture, then the way in, then the way out', stack.join(' < '));

// With a way in under it, the story holds still: one that moved itself on
// would take the key away from under a thumb on its way to it.
await tick(9000);
check(!!(await page.$('.whatsnew-sheet')) && await title() === last, 'the story with the way in holds still', await title());

// And a tap on the left half goes back.
await page.click('#whatsnew-back');
await tick(400);
check(await title() === 'EARN YOUR WILLOW', 'a tap back goes back a card', await title());

await page.click('#whatsnew-done');
await tick(700);
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  'the key puts the stories away');
const picked = await page.$eval('#modes', node => !node.classList.contains('hidden'));
const batting = await page.$eval('#start', node => !node.offsetParent).catch(() => true);
check(says === 'SKIP TO MODE SELECTION' ? picked : batting,
  'and lands where it promised', JSON.stringify({ says, picked, batting }));
check(await seen() === `${UPDATE}:1`, 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!!(await page.$('.whatsnew-sheet')), 'it comes back a second time, because once is missed');
await page.click('#whatsnew-done');

await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!(await page.$('.whatsnew-sheet')), 'and never again on its own');
check(await seen() === `${UPDATE}:2`, 'having been counted twice and no more', await seen());

// ── The way in for somebody who went looking ───────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#cover-board');
await tick(1200, 400);
// Since the board was redrawn the key sits under How ranking works, the (i).
await page.click('#board-info');
await tick(400);
const key = await page.$('#board-new');
check(!!key, 'the board carries a What\'s new key, under its (i)');
if (key) {
  await key.click();
  const back = await page.waitForSelector('.whatsnew-sheet', { timeout: 10_000 })
    .then(() => true).catch(() => false);
  check(back, 'which opens the same stories however many times they have been read');
  check(await page.$eval('#whatsnew-done', one => one.textContent.trim()) === 'CLOSE',
    'and offers to close rather than to go somewhere');
  await page.click('#whatsnew-done');
  await tick(500);
  check(await page.$eval('#board-overlay', node => !node.classList.contains('hidden')),
    'putting the player back on the board they came from');
  check(await seen() === `${UPDATE}:2`, 'without spending one of the two', await seen());
}

// ── The way in ─────────────────────────────────────────────────────────────
await page.evaluate(() => localStorage.removeItem('hitman-whatsnew'));
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
// On to the last card, a tap at a time: the cards before it also move on by
// themselves, so a fixed count of taps can overshoot.
for (let i = 0; i < 4 && !(await page.$('#whatsnew-open')); i++) { await page.click('#whatsnew-next'); await tick(400); }
check(!!(await page.$('#whatsnew-open')), 'tapping on reaches the way in', await title());
await page.click('#whatsnew-open');
let room = false;
for (let i = 0; i < 40 && !room; i++) { await tick(250, 250); room = !!(await page.$('#dressing-overlay')); }
check(room, 'which puts the stories away and opens the Dressing Room');
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')), 'with the stories gone from under it');
if (room) {
  // A first visit: Boom, which the story promised, waits on the bat shelf for its key.
  let waiting = false;
  for (let i = 0; i < 20 && !waiting; i++) { await tick(250, 250); waiting = !!(await page.$('#dressing-tab-bat.has-dot')); }
  check(waiting && !(await page.$('#unlock-overlay')), 'where Boom waits on the bat shelf, as the story said');
  await page.click('#dressing-back');
  await tick(500);
  check(await page.$eval('#modes', node => !node.classList.contains('hidden')), 'and its back key lands on Choose a mode');
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
