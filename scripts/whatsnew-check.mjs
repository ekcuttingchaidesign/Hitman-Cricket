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
const UPDATE = 'cameras';

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
// After Diwali week, whose kits' stories stand in Rivals live's place until the end of 11 November.
await page.clock.install({ time: new Date('2026-11-12T10:00:00+05:30') });

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

// The cameras: the same six through each camera on the row, then Pro Cam's
// speed in a Test match, both filmed in the game itself, then the cameras'
// pictures to pick from with GOT IT and TRY PRO CAM.
const card = () => page.evaluate(() => ({
  title: document.querySelector('.whatsnew-title')?.textContent.trim() ?? null,
  tag: document.getElementById('whatsnew-tag')?.textContent.trim() ?? null,
  filmed: document.querySelector('.whatsnew-sheet')?.classList.contains('is-filmed') ?? false,
  ground: document.getElementById('viewport')?.classList.contains('reel-on') ?? false,
  picks: [...document.querySelectorAll('.whatsnew-cam')].map(b => `${b.textContent.trim()}:${b.getAttribute('aria-checked')}`),
  open: document.getElementById('whatsnew-open')?.textContent.trim() ?? null, out: document.getElementById('whatsnew-done')?.textContent.trim() ?? null,
}));
/** Winds the page's clock on until the card's title is `want`, or gives up. */
async function windTo(want, most = 30_000) {
  for (let wound = 0; wound < most; wound += 250) {
    await page.clock.runFor(250);
    if ((await card()).title === want) { await page.waitForTimeout(200); return true; }
  }
  return false;
}
let now = await card();
check(now.title === 'THREE WAYS TO WATCH', 'it opens on the cameras', now.title);
await tick(400);
now = await card();
check(now.filmed && now.ground, 'filmed in the game, the card see-through over the ground', JSON.stringify(now));
check(now.tag === 'CLASSIC', 'the first ball through Classic, named over it', now.tag);
// Each ball through the next camera on the row, named as it starts.
const named = new Set([now.tag]);
for (let wound = 0; wound < 9000 && named.size < 3 && (await card()).title === 'THREE WAYS TO WATCH'; wound += 200) {
  await page.clock.runFor(200);
  const tag = (await card()).tag;
  if (tag) named.add(tag);
}
check(['CLASSIC', 'CLOSE', 'PRO CAM'].every(one => named.has(one)), 'then Close, then Pro Cam', [...named].join(', '));
check(await windTo('FEEL THE BALL SPEED'), 'and on by itself to Pro Cam\'s speed');
await tick(600);
now = await card();
check(now.filmed && /^\d{3} KM\/H$/.test(now.tag ?? ''), 'filmed too, the speed gun over it', JSON.stringify(now));
check(await windTo('PICK YOUR CAMERA'), 'and on by itself to the cameras');
now = await card();
check(now.picks.join(' ') === 'Classic:true Close:false Pro Cam:false', 'the three pictures, the one in use outlined', now.picks.join(' '));
check(now.out === 'GOT IT' && now.open === 'TRY PRO CAM', 'GOT IT and TRY PRO CAM under them', JSON.stringify(now));
check(!(await page.evaluate(() => document.getElementById('viewport').classList.contains('reel-on'))), 'the ground put back under it');
await tick(15_000);
check((await card()).title === 'PICK YOUR CAMERA', 'which holds still, rather than going on from under a thumb');
await page.click('#whatsnew-cam-close');
await tick(200);
now = await card();
check(now.picks.join(' ') === 'Classic:false Close:true Pro Cam:false', 'a picture pressed takes that camera', now.picks.join(' '));
check(await page.evaluate(() => localStorage.getItem('hitman-camera')) === 'close', 'and keeps it for the innings', await page.evaluate(() => localStorage.getItem('hitman-camera')));
await page.click('#whatsnew-done');
await tick(700);
// Where skipping goes is the build's: Choose a mode where there is one to
// choose, the innings where the build has chosen. Either way, somewhere.
const landed = async () => ({ hidden: await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  picked: await page.$eval('#modes', node => !node.classList.contains('hidden')),
  batting: await page.$eval('#start', node => !node.offsetParent).catch(() => true) });
const skippedTo = await landed();
check(skippedTo.hidden && (skippedTo.picked || skippedTo.batting), 'GOT IT goes on to Choose a mode or the innings', JSON.stringify(skippedTo));
check(await seen() === `${UPDATE}:1`, 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
// Waited for in real time: winding the page's clock with the film up runs the
// film to its end too in headless Chromium, which puts the stories away.
const again = await page.waitForSelector('.whatsnew-sheet', { timeout: 10_000 }).then(() => true).catch(() => false);
check(again, 'it comes back a second time, because once is missed');
// TRY PRO CAM this time: Pro Cam taken and kept, and a Blast walked out into under it.
await page.evaluate(() => { for (const story of [1, 2]) document.getElementById('whatsnew-next')?.click(); });
await page.waitForSelector('#whatsnew-open', { timeout: 10_000 });
await page.click('#whatsnew-open');
let tried = null;
for (let i = 0; i < 40 && !tried?.gone; i++) {
  await page.waitForTimeout(250);
  tried = await page.evaluate(() => ({ gone: document.querySelector('#whatsnew-overlay')?.classList.contains('hidden'),
    camera: localStorage.getItem('hitman-camera'), modes: !document.querySelector('#modes')?.classList.contains('hidden') }));
}
check(tried.gone && tried.camera === 'pro' && !tried.modes, 'and TRY PRO CAM takes Pro Cam and walks out into an innings', JSON.stringify(tried));

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
  check(await page.$eval('.whatsnew-sheet', sheet => sheet.classList.contains('is-filmed')), 'filmed in the game there too, off the cover');
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
