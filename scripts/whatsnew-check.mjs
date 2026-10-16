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
const UPDATE = 'new-shots';

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
// The stories play on the Dressing Room's stage, and every frame of it is a 3D
// render — seconds apiece in software, and the walk below winds the page's
// clock on by the second. So the stage's module is refused until the way in:
// the stories stand on their pictures meanwhile, as they do on a phone that
// cannot draw the stage, and the stage is watched playing at the end.
const stageModule = /\/DressingStage[^/]*\.(ts|js)(\?|$)/;
await page.route(stageModule, route => route.abort());
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

// The two new strokes first, each filmed in the game itself under a card the
// whole screen wide; then the Dressing Room in two, each with the way in.
const filmed = () => page.evaluate(() => {
  const sheet = document.querySelector('.whatsnew-sheet')?.getBoundingClientRect(), view = document.getElementById('viewport').getBoundingClientRect();
  const room = document.getElementById('whatsnew-room');
  const on = document.getElementById('viewport').classList.contains('reel-on');
  return { reel: on ? document.querySelector('.whatsnew-reel')?.dataset.reel ?? null : null, on,
    see: document.querySelector('.whatsnew-sheet')?.classList.contains('is-filmed') ?? false,
    edge: !!sheet && Math.abs(sheet.width - view.width) < 2 && Math.abs(sheet.height - view.height) < 2,
    // Nothing else on the ground in sight: the cover's poster, the scoreboard, Choose a mode.
    hidden: [...document.getElementById('viewport').children].filter(node => node.tagName !== 'CANVAS' && node.id !== 'whatsnew-overlay')
      .every(node => getComputedStyle(node).visibility === 'hidden'),
    open: !!document.getElementById('whatsnew-open'), out: document.getElementById('whatsnew-done')?.textContent.trim(),
    swipe: document.querySelector('.whatsnew-cue')?.dataset.way ?? null, call: room?.querySelector('.whatsnew-call')?.textContent ?? null,
    beats: ['is-cueing', 'is-hit'].filter(name => document.querySelector('.whatsnew-sheet')?.classList.contains(name)) };
});
const first = await title();
check(first === 'HOOK IT FOR SIX', 'it opens on the hook', first);
let film = await filmed();
check(film.reel === 'hook' && film.on && film.see && film.hidden, 'filmed in the game under the card, nothing else on the ground in sight', JSON.stringify(film));
check(film.edge, 'the card the whole screen, edge to edge', JSON.stringify(film));
check(!film.open && /^SKIP (TO MODE SELECTION|AND START BATTING)$/.test(film.out ?? '') && film.swipe === 'leg' && film.call === 'SIX',
  'one way out under it, the swipe to leg and the six waiting over him', JSON.stringify(film));

// Each holds a while and moves on by itself. Wound in half-second steps until
// it does: the installed clock also runs on by itself in real time, and one
// long wind on a slow machine carries a card past its own hold and the next one's too.
const beats = new Set();
const holds = async from => {
  let held = 0;
  for (; held < 14000 && await title() === from; held += 250) { (await filmed()).beats.forEach(beat => beats.add(beat)); await tick(250, 120); }
  return held;
};
let held = await holds(first);
check(held >= 5000, 'the hook holding for its film', `${held}ms`);
check(beats.has('is-cueing') && beats.has('is-hit'), 'the film held for the swipe drawn over it, then the six as he hits it', [...beats].join(','));
const cut = await title();
check(cut === 'SHOW IT THE WAY', 'and moving on by itself to the late cut', cut);
film = await filmed();
check(film.reel === 'latecut' && film.on && film.edge && film.swipe === 'off' && film.call === 'FOUR', 'filmed the same, the swipe down to off and the four', JSON.stringify(film));
held = await holds(cut);
check(held >= 5000, 'holding as long', `${held}ms`);
const kits = await title();
check(kits === 'SUIT UP', 'then on to the kits', kits);
film = await filmed();
check(!film.reel && !film.on, 'the film put away and the ground as it was', JSON.stringify(film));
check(!!(await page.$('#whatsnew-stage')) && !(await page.$('.whatsnew-sheet img')), 'full screen for the stage, with no picture to load');
check(!(await page.$('#whatsnew-stage.is-live')), 'its words standing on their own where the stage cannot be drawn');
// The two ways on side by side along the foot, the way out on the left, under the room for the stage.
const keys = () => page.evaluate(() => {
  const box = sel => document.querySelector(sel)?.getBoundingClientRect();
  const room = box('#whatsnew-room'), open = box('#whatsnew-open'), done = box('#whatsnew-done');
  return room && open && done ? { room: Math.round(room.bottom), outTop: Math.round(done.top), inTop: Math.round(open.top),
    outRight: Math.round(done.right), inLeft: Math.round(open.left),
    out: document.getElementById('whatsnew-done').textContent.trim(), in: document.getElementById('whatsnew-open').textContent.trim() } : null;
});
const paired = k => !!k && k.room <= k.inTop && Math.abs(k.outTop - k.inTop) < 12 && k.outRight < k.inLeft
  && k.out === 'SKIP' && k.in === 'GO TO DRESSING ROOM';
check(paired(await keys()), 'with SKIP and GO TO DRESSING ROOM side by side under the stage', JSON.stringify(await keys()));

// Each holds a while and moves on by itself. Wound in half-second steps until
// it does: the installed clock also runs on by itself in real time, and one
// long wind on a slow machine carries a card past its own hold and the next one's too.
held = await holds(kits);
check(held >= 5000, 'holding a while', `${held}ms`);
const last = await title();
check(last === 'EARN YOUR WILLOW', 'and moving on by itself to the bats, the last', last);
check(paired(await keys()), 'the same two keys in the same place', JSON.stringify(await keys()));

// With a way in under it, the story holds still: one that moved itself on
// would take the key away from under a thumb on its way to it.
await tick(9000);
check(!!(await page.$('.whatsnew-sheet')) && await title() === last, 'the last story holds still', await title());

// And a tap on the left half goes back.
await page.click('#whatsnew-back');
await tick(400);
check(await title() === 'SUIT UP', 'a tap back goes back a card', await title());
await page.click('#whatsnew-back');
await tick(400);
check(await title() === 'SHOW IT THE WAY' && (await filmed()).reel === 'latecut', 'and another back to the late cut, filmed again', await title());
await page.click('#whatsnew-next');
await tick(400);

await page.click('#whatsnew-done');
await tick(700);
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  'the key puts the stories away');
check(!(await page.$('#viewport.reel-on')), 'and no film left over the ground under whatever comes next');
// Where skipping goes is the build's: Choose a mode where there is one to
// choose, the innings where the build has chosen. Either way, somewhere.
const landed = async () => ({ hidden: await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  picked: await page.$eval('#modes', node => !node.classList.contains('hidden')),
  batting: await page.$eval('#start', node => !node.offsetParent).catch(() => true) });
const skippedTo = await landed();
check(skippedTo.picked || skippedTo.batting, 'and lands on Choose a mode or the innings', JSON.stringify(skippedTo));
check(await seen() === `${UPDATE}:1`, 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!!(await page.$('.whatsnew-sheet')), 'it comes back a second time, because once is missed');
// Put away this time from the last card: tapped on to it, it holds there.
for (let i = 0; i < 6 && await title() !== last; i++) { await page.click('#whatsnew-next'); await tick(400); }
await tick(9000);
check(await title() === last, 'tapped on to the last card, it holds there', await title());
await page.click('#whatsnew-done');
await tick(700);
const skipped = await landed();
check(skipped.hidden && skipped.picked === skippedTo.picked && skipped.batting === skippedTo.batting,
  'and SKIP there lands where it did from the first', JSON.stringify(skipped));

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
await page.unroute(stageModule);
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
// On past the strokes to the kits.
for (let i = 0; i < 4 && await title() !== 'SUIT UP'; i++) { await page.click('#whatsnew-next'); await tick(400); }
// The stage, playing where it can be drawn: the whole screen behind the words,
// with room between the title and them for the batter to stand in.
const staged = () => page.evaluate(() => {
  const sheet = document.querySelector('.whatsnew-sheet')?.getBoundingClientRect();
  const canvas = document.querySelector('#whatsnew-stage.is-live>canvas')?.getBoundingClientRect();
  const room = document.getElementById('whatsnew-room')?.getBoundingClientRect();
  return { full: !!sheet && !!canvas && Math.abs(sheet.width - canvas.width) < 2 && Math.abs(sheet.height - canvas.height) < 2, room: Math.round(room?.height ?? 0) };
});
let live = { full: false, room: 0 };
for (let i = 0; i < 40 && !live.full; i++) { await tick(100, 250); live = await staged(); }
check(live.full && await title() === 'SUIT UP', 'where it can be drawn, the kits play on the stage, full screen', JSON.stringify(live));
check(live.room > 200, 'with room between the words for the batter', `${live.room}px`);
// The way in from the first card, without reading on.
check(paired(await keys()), 'the way in right there on the first card of the room', JSON.stringify(await keys()));
// Choose a mode is under the room, and must never be seen on its own on the
// way: the stories go only once the room is up over them. Watched for on
// every change to the screens, not on frames, which this page's clock owns.
await page.evaluate(() => {
  window.__bare = 0;
  const shown = id => { const node = document.getElementById(id); return !!node && !node.classList.contains('hidden'); };
  const watch = new MutationObserver(() => {
    if (shown('modes') && !shown('whatsnew-overlay') && !document.querySelector('.dr-overlay')) window.__bare++;
  });
  watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.__unwatch = () => watch.disconnect();
});
await page.click('#whatsnew-open');
let room = false;
for (let i = 0; i < 40 && !room; i++) { await tick(250, 250); room = !!(await page.$('#dressing-overlay')); }
check(room, 'which puts the stories away and opens the Dressing Room');
const bare = await page.evaluate(() => { window.__unwatch(); return window.__bare; });
check(bare === 0, 'without Choose a mode showing through on the way', `${bare} times`);
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')), 'with the stories gone from under it');
if (room) {
  // A first visit: Boom waits on the bat shelf for its key, nothing going off on the way in.
  let waiting = false;
  for (let i = 0; i < 20 && !waiting; i++) { await tick(250, 250); waiting = !!(await page.$('#dressing-tab-bat.has-dot')); }
  check(waiting && !(await page.$('#unlock-overlay')), 'where Boom waits on the bat shelf');
  await page.click('#dressing-back');
  await tick(500);
  check(await page.$eval('#modes', node => !node.classList.contains('hidden')), 'and its back key lands on Choose a mode');
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
