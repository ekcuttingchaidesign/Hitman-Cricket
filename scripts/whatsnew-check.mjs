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
const UPDATE = 'player-profiles';

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
// Twice and then never, on a clock of its own.
await page.clock.install({ time: new Date('2026-11-02T10:00:00+05:30') });

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

// One film, the player profiles, played down the sheet with the one way out under it.
const filmView = () => page.evaluate(() => {
  const host = document.getElementById('whatsnew-film'), svg = host?.querySelector('svg')?.getBoundingClientRect();
  const done = document.getElementById('whatsnew-done')?.getBoundingClientRect();
  return { film: host?.dataset.film ?? null, fit: host ? ['is-fit', 'is-cut'].filter(name => host.classList.contains(name)) : [],
    drawn: !!svg && svg.width > 100 && svg.height > 100, above: !!svg && !!done && svg.bottom <= done.top + 2,
    sheet: document.querySelector('.whatsnew-sheet')?.classList.contains('is-film') ?? false,
    bars: document.querySelectorAll('.whatsnew-bar').length, unseen: document.querySelector('.whatsnew-title')?.classList.contains('is-unseen') ?? false,
    open: !!document.getElementById('whatsnew-open'), out: document.getElementById('whatsnew-done')?.textContent.trim() };
});
const first = await title();
check(first === 'PLAYER PROFILES AND MY PROFILE', 'it opens on the player profiles', first);
let film = await filmView();
for (let i = 0; i < 30 && !film.drawn; i++) { await tick(100, 200); film = await filmView(); }
check(film.sheet && film.film === 'player-profiles' && film.drawn && film.fit.length === 1, 'the film plays down the sheet', JSON.stringify(film));
check(film.above, 'and stops above the way out', JSON.stringify(film));
check(film.bars === 1 && film.unseen, 'one bar, its title read out rather than shown over the film', JSON.stringify(film));
check(!film.open && /^SKIP (TO MODE SELECTION|AND START BATTING)$/.test(film.out ?? ''), 'one way out under it', JSON.stringify(film));

// It holds for the film and a beat over, then moves on by itself, out of the
// stories. Wound in quarter-second steps: one long wind on a slow machine
// carries past the hold before it can be measured.
let held = 0;
for (; held < 14000 && await page.$('.whatsnew-sheet') && !(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden'))); held += 250) await tick(250, 80);
check(held >= 9500 && held < 11500, 'holding for its film, then moving on by itself', `${held}ms`);
check(!(await page.$('#whatsnew-film svg')), 'the film taken down with it');
// Where skipping goes is the build's: Choose a mode where there is one to
// choose, the innings where the build has chosen. Either way, somewhere.
const landed = async () => ({ hidden: await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  picked: await page.$eval('#modes', node => !node.classList.contains('hidden')),
  batting: await page.$eval('#start', node => !node.offsetParent).catch(() => true) });
const skippedTo = await landed();
check(skippedTo.hidden && (skippedTo.picked || skippedTo.batting), 'and lands on Choose a mode or the innings', JSON.stringify(skippedTo));
check(await seen() === `${UPDATE}:1`, 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!!(await page.$('.whatsnew-sheet')), 'it comes back a second time, because once is missed');
// Put away this time by its key.
await page.click('#whatsnew-done');
await tick(700);
const skipped = await landed();
check(skipped.hidden && skipped.picked === skippedTo.picked && skipped.batting === skippedTo.batting,
  'and its key lands where the film did by itself', JSON.stringify(skipped));

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

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
